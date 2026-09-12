import prismadb from "@/lib/prismadb";
import {
  OPEN_RESTOCK_STATUSES,
  PURCHASE_RESTOCK_STATUSES,
  type SupplierDetail,
} from "@/lib/suppliers";
import { RestockOrderStatus } from "@prisma/client";

/**
 * Proveedor de la tienda con su uso (conteos, pedidos abiertos, última
 * compra) y sus últimos cinco pedidos de aprovisionamiento. Devuelve `null`
 * cuando el id no existe o pertenece a otra tienda.
 *
 * Es una función de servidor normal (sin `"use server"`): solo la llama la
 * página, así que nunca queda expuesta como acción invocable desde el cliente.
 */
export async function getSupplier(
  storeId: string,
  supplierId: string,
): Promise<SupplierDetail | null> {
  const supplier = await prismadb.supplier.findFirst({
    where: { id: supplierId, storeId },
    include: {
      _count: { select: { products: true, restockOrders: true } },
      restockOrders: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
          totalAmount: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  if (!supplier) return null;

  const [openByStatus, lastPurchase] = await Promise.all([
    prismadb.restockOrder.groupBy({
      by: ["status"],
      where: {
        storeId,
        supplierId,
        status: { in: OPEN_RESTOCK_STATUSES },
      },
      _count: { _all: true },
    }),
    prismadb.restockOrder.findFirst({
      where: {
        storeId,
        supplierId,
        status: { in: PURCHASE_RESTOCK_STATUSES },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const countFor = (status: RestockOrderStatus) =>
    openByStatus.find((row) => row.status === status)?._count._all ?? 0;

  const { _count, restockOrders, ...fields } = supplier;

  return {
    ...fields,
    usage: {
      products: _count.products,
      restockOrders: _count.restockOrders,
      orderedRestockOrders: countFor(RestockOrderStatus.ORDERED),
      receivingRestockOrders: countFor(RestockOrderStatus.PARTIALLY_RECEIVED),
      lastPurchaseAt: lastPurchase?.createdAt ?? null,
    },
    recentRestockOrders: restockOrders,
  };
}
