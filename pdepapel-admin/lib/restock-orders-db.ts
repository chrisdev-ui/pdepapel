import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

/** Forma completa de un pedido de aprovisionamiento para la API y la página. */
export const RESTOCK_ORDER_INCLUDE = {
  supplier: { select: { id: true, name: true, leadTimeDays: true } },
  items: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, stock: true, acqPrice: true, transportationCost: true, supplierId: true },
      },
    },
    orderBy: { index: "asc" as const },
  },
  receipts: { orderBy: { createdAt: "desc" as const } },
};

/** Comprueba que proveedor y productos pertenezcan a la tienda. */
export async function assertRestockReferences(storeId: string, supplierId: string, productIds: string[]) {
  const [supplier, products] = await Promise.all([
    prismadb.supplier.findFirst({ where: { id: supplierId, storeId }, select: { id: true } }),
    prismadb.product.findMany({ where: { id: { in: productIds }, storeId }, select: { id: true } }),
  ]);
  if (!supplier) throw ErrorFactory.InvalidRequest("El proveedor no existe en esta tienda.");
  const found = new Set(products.map((product) => product.id));
  const missing = productIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw ErrorFactory.InvalidRequest("Uno de los productos ya no existe o no pertenece a esta tienda. Recarga la página.");
  }
}

export type RestockOrderWithRelations = Prisma.RestockOrderGetPayload<{ include: typeof RESTOCK_ORDER_INCLUDE }>;
