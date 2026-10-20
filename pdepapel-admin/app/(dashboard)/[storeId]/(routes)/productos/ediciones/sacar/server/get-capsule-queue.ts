import { liveDayStatus } from "@/lib/capsule-day-cap";
import { listCapsuleQueue } from "@/lib/capsule-orders";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";

/** Solo la dueña: la cola lleva el costo provisional y real de cada pedido. */
export async function getCapsuleQueue(storeId: string) {
  await requireStoreOwner(storeId);
  const [orders, boxes, day] = await Promise.all([
    listCapsuleQueue(storeId),
    prismadb.box.findMany({ where: { storeId }, select: { name: true, type: true, isDefault: true } }),
    liveDayStatus(storeId),
  ]);
  return { orders, boxes, day };
}
