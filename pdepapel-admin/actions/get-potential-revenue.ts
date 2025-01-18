import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getPotentialRevenue(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId: storeId,
      isArchived: false,
      categoryId: {
        not: CAPSULAS_SORPRESA_ID,
      },
    },
    select: {
      stock: true,
      price: true,
    },
  });

  const potentialRevenue = products.reduce((sum, product) => {
    return sum + product.stock * product.price;
  }, 0);

  return potentialRevenue;
}
