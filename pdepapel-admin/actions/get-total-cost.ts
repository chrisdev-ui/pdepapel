import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getTotalCost(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId,
      isArchived: false,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
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

  return totalCost;
}
