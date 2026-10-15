import { OrderInventoryIssueKind } from "@prisma/client";
import { Redis } from "@upstash/redis";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";

/**
 * Correos de revisión de inventario (lib/stock-review.ts los agenda). Aparte
 * para que el inventario no cargue correo, Redis ni el entorno al importarse.
 */
const ALERT_TTL_SECONDS = 60 * 60 * 24 * 14;
/** Esperas antes de mirar si la transacción ya se confirmó (ms). */
const COMMIT_WAITS = [1_500, 3_000, 6_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimAlert(key: string): Promise<boolean> {
  if (env.NODE_ENV !== "production") return true;
  try {
    return (await Redis.fromEnv().set(key, "1", { ex: ALERT_TTL_SECONDS, nx: true })) === "OK";
  } catch (error) {
    console.error("[STOCK_REVIEW] No se pudo registrar el aviso; se envía igual:", error);
    return true;
  }
}

async function send(storeId: string | undefined, subject: string, text: string): Promise<boolean> {
  const to = await getAdminNotificationRecipients(storeId);
  if (to.length === 0) {
    console.warn("[STOCK_REVIEW] Sin correos para avisos en Configuración; no se avisa.");
    return false;
  }
  await resend.emails.send({ from: "Papelería P de Papel <orders@papeleriapdepapel.com>", to, subject, text });
  return true;
}

export async function notifyStockShortfall(storeId: string, orderId: string, waits: number[] = COMMIT_WAITS): Promise<boolean> {
  for (const wait of waits) {
    await sleep(wait);
    const issues = await prismadb.orderInventoryIssue.findMany({
      where: { storeId, orderId, kind: OrderInventoryIssueKind.DECREMENT, resolvedAt: null },
      select: { orderNumber: true, productName: true, quantity: true },
    });
    if (issues.length === 0) continue;
    if (!(await claimAlert(`alert:stock-shortfall:${orderId}`))) return false;
    const lines = issues.map((issue) => `• ${issue.productName}: faltan ${issue.quantity}`).join("\n");
    return send(
      storeId,
      `[Revisar] Pedido ${issues[0].orderNumber} pagado sin stock suficiente`,
      `El pedido ${issues[0].orderNumber} se pagó, pero no había unidades para:\n${lines}\n\n` +
        "No se creó la guía de envío automáticamente. Abre el pedido en Pedidos: repón o cambia el producto con la clienta, o devuélvele el dinero. " +
        "La incidencia de inventario queda abierta en el pedido hasta que la resuelvas.",
    );
  }
  return false;
}

export async function notifyUnbackedReservations(reservationIds: string[], waits: number[] = COMMIT_WAITS): Promise<boolean> {
  for (const wait of waits) {
    await sleep(wait);
    const holds = await prismadb.stockReservation.findMany({
      where: { id: { in: reservationIds }, unbackedAt: { not: null } },
      select: { id: true, storeId: true, quantity: true, customerName: true, product: { select: { name: true } } },
    });
    if (holds.length === 0) continue;
    const fresh = [];
    for (const hold of holds) if (await claimAlert(`alert:reservation-unbacked:${hold.id}`)) fresh.push(hold);
    if (fresh.length === 0) return false;
    const lines = fresh.map((hold) => `• ${hold.product?.name} × ${hold.quantity} (reserva de ${hold.customerName})`).join("\n");
    return send(
      fresh[0].storeId,
      `[Revisar] ${fresh.length === 1 ? "Una reserva quedó" : `${fresh.length} reservas quedaron`} sin respaldo`,
      `Una venta pagada se llevó las unidades que estas reservas guardaban:\n${lines}\n\n` +
        "La venta no se deshace. Revisa en Reservas si repones, ofreces otro producto a la clienta o liberas la reserva.",
    );
  }
  return false;
}
