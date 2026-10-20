import { ErrorFactory } from "@/lib/api-errors";

/**
 * Un pedido de cápsulas no sale (ni se le compra guía) mientras su sorteo no
 * esté cerrado: la caja sale de lo que se sacó, y sacar un pedido ya enviado
 * se niega. Módulo liviano a propósito: lo importan las rutas de pedidos y la
 * creación de guías.
 */
export const CAPSULE_DRAW_PENDING_MESSAGE = "Primero termina de sacar los papeles del pedido de cápsulas y cierra el sorteo";

type CapsuleOrderReader = { capsuleOrder: { findMany: (args: { where: { orderId: { in: string[] }; drawCompletedAt: null }; select: { orderId: true } }) => Promise<{ orderId: string }[]> } };

/** Los pedidos de la lista que son de cápsulas y todavía no cierran su sorteo. */
export async function ordersWithPendingCapsuleDraw(db: CapsuleOrderReader, orderIds: readonly string[]): Promise<string[]> {
  if (orderIds.length === 0) return [];
  const rows = await db.capsuleOrder.findMany({ where: { orderId: { in: [...orderIds] }, drawCompletedAt: null }, select: { orderId: true } });
  return rows.map((row) => row.orderId);
}

export async function assertCapsuleDrawsClosed(db: CapsuleOrderReader, orderIds: readonly string[]) {
  const pending = await ordersWithPendingCapsuleDraw(db, orderIds);
  if (pending.length > 0) throw ErrorFactory.Conflict(CAPSULE_DRAW_PENDING_MESSAGE);
}
