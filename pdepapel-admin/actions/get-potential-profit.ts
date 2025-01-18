import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getPotentialProfit(storeId: string) {
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
      acqPrice: true,
    },
  });

  const potentialProfit = products.reduce((sum, product) => {
    const profit = product.stock * (product.price - (product.acqPrice || 0));
    return sum + profit;
  }, 0);

  return potentialProfit;
}
