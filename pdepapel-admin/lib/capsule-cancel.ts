import { CapsuleSlipKind, CapsuleSlipStatus, Prisma } from "@prisma/client";

type CancelDb = Pick<Prisma.TransactionClient, "capsuleOrder" | "capsuleSlip">;

/**
 * Cancelar o anular un pedido de cápsulas pagado devuelve al producto de la
 * edición solo los papeles que no alcanzaron a sacarse: su stock son los
 * papeles sin vender, y un papel sacado ya no lo es. Los papeles sacados
 * quedan DRAWN con el pedido (historia del sorteo) y sus productos reales
 * vuelven a bodega con una «Devolución» del inventario cuando lleguen.
 *
 * Recibe los movimientos de reingreso de cualquier camino de cancelación
 * (Bold, Wompi, panel uno o en lote, borrar uno o en lote) y devuelve los
 * mismos con la línea de la edición recortada. Sin pedidos de cápsulas no
 * cambia nada.
 */
export async function withoutDrawnCapsuleUnits<T extends { productId: string; referenceId?: string | null; quantity: number }>(db: CancelDb, movements: T[]): Promise<T[]> {
  const orderIds = Array.from(new Set(movements.filter((movement) => movement.quantity > 0 && movement.referenceId).map((movement) => movement.referenceId as string)));
  if (orderIds.length === 0) return movements;
  const capsuleOrders = await db.capsuleOrder.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, edition: { select: { productId: true } } } });
  if (capsuleOrders.length === 0) return movements;
  const drawn = await db.capsuleSlip.groupBy({
    by: ["orderId"],
    where: { orderId: { in: capsuleOrders.map((row) => row.orderId) }, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.DRAWN },
    _count: { _all: true },
  });
  const drawnByOrder = new Map(drawn.map((row) => [row.orderId, row._count._all]));
  const editionProductByOrder = new Map(capsuleOrders.map((row) => [row.orderId, row.edition.productId]));
  return movements.flatMap((movement) => {
    const orderId = movement.referenceId ?? "";
    if (movement.quantity <= 0 || editionProductByOrder.get(orderId) !== movement.productId) return [movement];
    const quantity = movement.quantity - (drawnByOrder.get(orderId) ?? 0);
    return quantity > 0 ? [{ ...movement, quantity }] : [];
  });
}
