import prismadb from "@/lib/prismadb";
import {
  OPEN_RESTOCK_STATUSES,
  PURCHASE_RESTOCK_STATUSES,
  type SupplierRow,
} from "@/lib/suppliers";
import { RestockOrderStatus } from "@prisma/client";

/**
 * Proveedores de la tienda con sus conteos y su última compra, para la lista.
 * Función de servidor normal (sin `"use server"`): solo la llama la página.
 */
export async function getSuppliers(storeId: string): Promise<SupplierRow[]> {
  const [suppliers, openByStatus] = await Promise.all([
    prismadb.supplier.findMany({
      where: { storeId },
      include: {
        _count: { select: { products: true, restockOrders: true } },
        restockOrders: {
          where: { status: { in: PURCHASE_RESTOCK_STATUSES } },
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prismadb.restockOrder.groupBy({
      by: ["supplierId", "status"],
      where: { storeId, status: { in: OPEN_RESTOCK_STATUSES } },
      _count: { _all: true },
    }),
  ]);

  const openCount = (supplierId: string, status: RestockOrderStatus) =>
    openByStatus.find(
      (row) => row.supplierId === supplierId && row.status === status,
    )?._count._all ?? 0;

  return suppliers.map(({ _count, restockOrders, ...fields }) => ({
    ...fields,
    products: _count.products,
    usage: {
      products: _count.products,
      restockOrders: _count.restockOrders,
      orderedRestockOrders: openCount(fields.id, RestockOrderStatus.ORDERED),
      receivingRestockOrders: openCount(
        fields.id,
        RestockOrderStatus.PARTIALLY_RECEIVED,
      ),
      lastPurchaseAt: restockOrders[0]?.createdAt ?? null,
    },
  }));
}
