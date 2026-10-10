import { OrderStatus, PaymentMethod } from "@prisma/client";
import { subDays, subHours } from "date-fns";

import { rankProductProfitForSystemJob, type ProductProfitRanking } from "@/actions/get-product-profitability";
import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

/**
 * Trabajos que llegaron del flujo `scheduler.yml`, que nunca corrió (vivía en
 * una carpeta que GitHub no lee). Cada uno cambia datos de producción o
 * escribe a clientas, así que entran apagados: mientras `enabled` sea false,
 * su ruta solo simula y devuelve cifras, sin escribir nada. Encender uno es
 * cambiar esta constante y su paso en `admin-scheduled-tasks.yml`.
 */
export const SCHEDULED_JOBS = {
  "abc-classification": { enabled: false },
  "customer-reactivation": { enabled: false },
  "bank-transfer-review": { enabled: false },
} as const satisfies Record<string, { enabled: boolean }>;

export type ScheduledJobName = keyof typeof SCHEDULED_JOBS;
export type ScheduledJobMode = "dry-run" | "apply";

/** `?mode=apply` solo con el trabajo encendido; sin parámetro, simulación. */
export function resolveScheduledJobMode(url: string, job: ScheduledJobName): ScheduledJobMode {
  const requested = new URL(url).searchParams.get("mode");
  if (requested !== null && requested !== "dry-run" && requested !== "apply") {
    throw ErrorFactory.InvalidRequest("mode debe ser dry-run o apply");
  }
  if (requested !== "apply") return "dry-run";
  if (!SCHEDULED_JOBS[job].enabled) {
    throw ErrorFactory.Conflict(`El trabajo ${job} está apagado: solo admite mode=dry-run`);
  }
  return "apply";
}

export const ABC_WINDOW_DAYS = 180;
export type AbcClass = "A" | "B" | "C";

/** A: el 80 % de la utilidad; B: hasta el 95 %; C: el resto y lo que no dejó utilidad. */
export function classifyAbc(ranking: Pick<ProductProfitRanking, "productId" | "totalProfit">[]): Map<string, AbcClass> {
  const sorted = [...ranking].sort((a, b) => b.totalProfit - a.totalProfit);
  const totalProfit = sorted.reduce((sum, item) => sum + Math.max(0, item.totalProfit), 0);
  const classes = new Map<string, AbcClass>();
  let cumulative = 0;
  for (const item of sorted) {
    if (item.totalProfit <= 0 || totalProfit <= 0) {
      classes.set(item.productId, "C");
      continue;
    }
    cumulative += item.totalProfit;
    const share = (cumulative / totalProfit) * 100;
    classes.set(item.productId, share <= 80 ? "A" : share <= 95 ? "B" : "C");
  }
  return classes;
}

export interface AbcPlan {
  products: number;
  withSales: number;
  target: Record<AbcClass, number>;
  /** Filas que cambiarían, por clase de destino. */
  changes: Record<AbcClass, string[]>;
}

export async function planAbcClassification(storeId: string, now = new Date()): Promise<AbcPlan> {
  const ranking = await rankProductProfitForSystemJob(storeId, undefined, undefined, Number.MAX_SAFE_INTEGER, {
    start: subDays(now, ABC_WINDOW_DAYS),
    end: now,
  });
  const classes = classifyAbc(ranking);
  const products = await prismadb.product.findMany({
    where: { storeId },
    select: { id: true, abcClassification: true },
  });
  const target: Record<AbcClass, number> = { A: 0, B: 0, C: 0 };
  const changes: Record<AbcClass, string[]> = { A: [], B: [], C: [] };
  for (const product of products) {
    const next = classes.get(product.id) ?? "C";
    target[next] += 1;
    if (product.abcClassification !== next) changes[next].push(product.id);
  }
  return { products: products.length, withSales: ranking.length, target, changes };
}

/** Solo toca las filas cuya clase cambia, para no mover `updatedAt` de todo el catálogo. */
export async function applyAbcClassification(storeId: string, plan: AbcPlan): Promise<number> {
  let updated = 0;
  for (const abcClass of ["A", "B", "C"] as const) {
    const ids = plan.changes[abcClass];
    for (let index = 0; index < ids.length; index += 500) {
      const result = await prismadb.product.updateMany({
        where: { storeId, id: { in: ids.slice(index, index + 500) } },
        data: { abcClassification: abcClass },
      });
      updated += result.count;
    }
  }
  return updated;
}

export const summarizeAbcPlan = (plan: AbcPlan) => ({
  products: plan.products,
  withSales: plan.withSales,
  target: plan.target,
  wouldChange: plan.changes.A.length + plan.changes.B.length + plan.changes.C.length,
});

export const BANK_TRANSFER_REVIEW_NOTE =
  "⚠️ ACCIÓN REQUERIDA: Transferencia bancaria vencida (>48h). Por favor, contacta al cliente para gestionar el pago o cancela el pedido manualmente.";
export const BANK_TRANSFER_GRACE_HOURS = 48;

export interface BankTransferPlan {
  pending: number;
  alreadyFlagged: number;
  toFlag: { id: string; adminNotes: string | null }[];
  byAge: { upTo7Days: number; upTo30Days: number; olderThan30Days: number };
}

export async function planBankTransferReview(storeId: string, now = new Date()): Promise<BankTransferPlan> {
  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      status: { in: [OrderStatus.PENDING, OrderStatus.CREATED] },
      createdAt: { lt: subHours(now, BANK_TRANSFER_GRACE_HOURS) },
      payment: { method: PaymentMethod.BankTransfer },
    },
    select: { id: true, createdAt: true, adminNotes: true },
  });
  const byAge = { upTo7Days: 0, upTo30Days: 0, olderThan30Days: 0 };
  const toFlag: BankTransferPlan["toFlag"] = [];
  let alreadyFlagged = 0;
  for (const order of orders) {
    const ageDays = (now.getTime() - order.createdAt.getTime()) / 86_400_000;
    if (ageDays <= 7) byAge.upTo7Days += 1;
    else if (ageDays <= 30) byAge.upTo30Days += 1;
    else byAge.olderThan30Days += 1;
    if (order.adminNotes?.includes(BANK_TRANSFER_REVIEW_NOTE)) alreadyFlagged += 1;
    else toFlag.push({ id: order.id, adminNotes: order.adminNotes });
  }
  return { pending: orders.length, alreadyFlagged, toFlag, byAge };
}

/** Agrega el aviso debajo de las notas de Paula; nunca las reemplaza. */
export function appendBankTransferNote(adminNotes: string | null): string {
  const current = adminNotes?.trim();
  return current ? `${current}\n\n${BANK_TRANSFER_REVIEW_NOTE}` : BANK_TRANSFER_REVIEW_NOTE;
}

export async function applyBankTransferReview(storeId: string, plan: BankTransferPlan): Promise<number> {
  let flagged = 0;
  for (const order of plan.toFlag) {
    const result = await prismadb.order.updateMany({
      where: { id: order.id, storeId, adminNotes: order.adminNotes },
      data: { adminNotes: appendBankTransferNote(order.adminNotes) },
    });
    flagged += result.count;
  }
  return flagged;
}

export const summarizeBankTransferPlan = (plan: BankTransferPlan) => ({
  pending: plan.pending,
  alreadyFlagged: plan.alreadyFlagged,
  wouldFlag: plan.toFlag.length,
  byAge: plan.byAge,
});
