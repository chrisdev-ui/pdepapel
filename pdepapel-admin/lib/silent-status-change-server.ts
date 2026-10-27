import { NotificationChannel, OrderNotificationStatus, type OrderStatus, type PrismaClient, type ShippingStatus } from "@prisma/client";

import { SILENT_CHANGE_REASON, silentChangeDedupeKey, silentChangeMilestone } from "@/lib/silent-status-change";

export interface SilentChangeBefore {
  orderId: string;
  status: OrderStatus;
  shippingStatus: ShippingStatus | null;
}

/**
 * Una fila SKIPPED por pedido cuyo estado (o el de su envío) sí cambió; si
 * cambiaron los dos, manda el del pedido. Se lee después del commit: lo que
 * cuenta es lo que quedó guardado.
 */
export async function recordSilentStatusChanges(
  db: Pick<PrismaClient, "order" | "orderNotification">,
  input: { storeId: string; createdBy: string; before: SilentChangeBefore[] },
): Promise<number> {
  if (input.before.length === 0) return 0;
  const current = await db.order.findMany({
    where: { storeId: input.storeId, id: { in: input.before.map((row) => row.orderId) } },
    select: { id: true, status: true, shipping: { select: { id: true, status: true } } },
  });
  const byId = new Map(current.map((order) => [order.id, order]));
  const rows = input.before.flatMap((before) => {
    const order = byId.get(before.orderId);
    if (!order) return [];
    const statusChanged = order.status !== before.status;
    const shippingChanged = Boolean(order.shipping && order.shipping.status !== before.shippingStatus);
    if (!statusChanged && !shippingChanged) return [];
    return [
      {
        storeId: input.storeId,
        orderId: order.id,
        shippingId: order.shipping?.id ?? null,
        milestone: silentChangeMilestone(statusChanged ? order.status : (order.shipping!.status as ShippingStatus)),
        channel: NotificationChannel.EMAIL,
        role: "customer",
        status: OrderNotificationStatus.SKIPPED,
        reason: SILENT_CHANGE_REASON,
        createdBy: input.createdBy,
        dedupeKey: silentChangeDedupeKey(order.id),
      },
    ];
  });
  if (rows.length === 0) return 0;
  const { count } = await db.orderNotification.createMany({ data: rows });
  return count;
}
