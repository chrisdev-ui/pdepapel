import { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { format, subDays, subHours } from "date-fns";

import { rankProductProfitForSystemJob, type ProductProfitRanking } from "@/actions/get-product-profitability";
import { ErrorFactory } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";

/**
 * Trabajos que llegaron del flujo `scheduler.yml`, que nunca corrió (vivía en
 * una carpeta que GitHub no lee). Mientras `enabled` sea false, su ruta solo
 * simula y devuelve cifras, sin escribir nada. Encender uno es cambiar esta
 * constante, su paso en `admin-scheduled-tasks.yml` y `JOB_DEFINITIONS`.
 * La reactivación escribe a clientas: sigue apagada hasta que Christian vea
 * cuántas tienen consentimiento.
 */
export const SCHEDULED_JOBS = {
  "abc-classification": { enabled: true },
  "customer-reactivation": { enabled: false },
  "bank-transfer-review": { enabled: true },
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

/**
 * Solo las filas cuya clase cambia, y solo esa columna: sin `updatedAt`, que
 * el sitemap publica como `lastmod`. La clase no alimenta la tienda, los
 * feeds ni Mercado Libre, así que no hay nada que revalidar ni sincronizar.
 */
export async function applyAbcClassification(storeId: string, plan: AbcPlan): Promise<number> {
  let updated = 0;
  for (const abcClass of ["A", "B", "C"] as const) {
    const ids = plan.changes[abcClass];
    for (let index = 0; index < ids.length; index += 500) {
      updated += await prismadb.$executeRaw`UPDATE \`Product\` SET \`abcClassification\` = ${abcClass} WHERE \`storeId\` = ${storeId} AND \`id\` IN (${Prisma.join(ids.slice(index, index + 500))})`;
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

/** Lo que se busca para no repetir el aviso; la línea completa lleva la fecha. */
export const BANK_TRANSFER_REVIEW_MARKER = "Transferencia bancaria vencida (>48h)";
export const BANK_TRANSFER_REVIEW_NOTE = `⚠️ ACCIÓN REQUERIDA: ${BANK_TRANSFER_REVIEW_MARKER}. Por favor, contacta al cliente para gestionar el pago o cancela el pedido manualmente.`;
export const BANK_TRANSFER_GRACE_HOURS = 48;
/** Pedidos más viejos ya no se marcan: a esa altura Paula ya los conoce. */
export const BANK_TRANSFER_MAX_AGE_DAYS = 30;

export interface BankTransferPlan {
  pending: number;
  alreadyFlagged: number;
  skippedOlderThan30Days: number;
  toFlag: { id: string; adminNotes: string | null }[];
  byAge: { upTo7Days: number; upTo30Days: number };
}

export async function planBankTransferReview(storeId: string, now = new Date()): Promise<BankTransferPlan> {
  const unpaid = {
    storeId,
    status: { in: [OrderStatus.PENDING, OrderStatus.CREATED] },
    payment: { method: PaymentMethod.BankTransfer },
  };
  const [orders, skippedOlderThan30Days] = await Promise.all([
    prismadb.order.findMany({
      where: {
        ...unpaid,
        createdAt: { lt: subHours(now, BANK_TRANSFER_GRACE_HOURS), gte: subDays(now, BANK_TRANSFER_MAX_AGE_DAYS) },
      },
      select: { id: true, createdAt: true, adminNotes: true },
    }),
    prismadb.order.count({ where: { ...unpaid, createdAt: { lt: subDays(now, BANK_TRANSFER_MAX_AGE_DAYS) } } }),
  ]);
  const byAge = { upTo7Days: 0, upTo30Days: 0 };
  const toFlag: BankTransferPlan["toFlag"] = [];
  let alreadyFlagged = 0;
  for (const order of orders) {
    const ageDays = (now.getTime() - order.createdAt.getTime()) / 86_400_000;
    if (ageDays <= 7) byAge.upTo7Days += 1;
    else byAge.upTo30Days += 1;
    if (order.adminNotes?.includes(BANK_TRANSFER_REVIEW_MARKER)) alreadyFlagged += 1;
    else toFlag.push({ id: order.id, adminNotes: order.adminNotes });
  }
  return { pending: orders.length, alreadyFlagged, skippedOlderThan30Days, toFlag, byAge };
}

/** `[Automático] AAAA-MM-DD — aviso`, debajo de las notas que ya haya; nunca las reemplaza. */
export function appendBankTransferNote(adminNotes: string | null, now = new Date()): string {
  const line = `[Automático] ${format(getColombiaDate(now), "yyyy-MM-dd")} — ${BANK_TRANSFER_REVIEW_NOTE}`;
  const current = adminNotes?.trim();
  return current ? `${current}\n\n${line}` : line;
}

export async function applyBankTransferReview(storeId: string, plan: BankTransferPlan, now = new Date()): Promise<number> {
  let flagged = 0;
  for (const order of plan.toFlag) {
    const result = await prismadb.order.updateMany({
      where: { id: order.id, storeId, adminNotes: order.adminNotes },
      data: { adminNotes: appendBankTransferNote(order.adminNotes, now) },
    });
    flagged += result.count;
  }
  return flagged;
}

export const summarizeBankTransferPlan = (plan: BankTransferPlan) => ({
  pending: plan.pending,
  alreadyFlagged: plan.alreadyFlagged,
  skippedOlderThan30Days: plan.skippedOlderThan30Days,
  wouldFlag: plan.toFlag.length,
  byAge: plan.byAge,
});
