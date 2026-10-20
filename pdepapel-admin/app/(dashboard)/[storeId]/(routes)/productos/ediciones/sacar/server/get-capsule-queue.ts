import { liveDayStatus } from "@/lib/capsule-day-cap";
import { listCapsuleQueue, listPendingTransferCapsuleOrders } from "@/lib/capsule-orders";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

/** Solo la dueña: la cola lleva el costo provisional y real de cada pedido. */
export async function getCapsuleQueue(storeId: string) {
  await requireStoreOwner(storeId);
  const [orders, pendingTransfers, boxes, day] = await Promise.all([
    listCapsuleQueue(storeId),
    listPendingTransferCapsuleOrders(storeId),
    prismadb.box.findMany({ where: { storeId }, select: { name: true, type: true, isDefault: true } }),
    liveDayStatus(storeId),
  ]);
  return { orders, pendingTransfers, boxes, day };
}
