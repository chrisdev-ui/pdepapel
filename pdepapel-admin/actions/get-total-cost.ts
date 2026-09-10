import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getTotalCost(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
      // Un kit no tiene stock propio: su valor ya esta contado en los
      // componentes. Se excluye por `isKit`, no por la categoria "Kits", para
      // que un kit archivado en otra categoria no duplique el inventario
      // (misma regla que `lib/inventory-views.ts › inventoryRowValue`).
      isKit: false,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID],
      },
    },
    select: {
      stock: true,
      acqPrice: true,
    },
  });

  const totalCost = products.reduce(
    (sum, product) => sum + product.stock * (product.acqPrice || 0),
    0,
  );

  return Math.round(totalCost * 100) / 100;
}
