import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getPotentialProfit(storeId: string) {
  const products = await prismadb.product.findMany({
    where: {
      storeId: storeId,
      isArchived: false,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
    select: {
      id: true,
      categoryId: true,
      stock: true,
      price: true,
      acqPrice: true,
    },
  });

  const { getProductsPrices } = await import("@/lib/discount-engine");
  const pricesMap = await getProductsPrices(products, storeId);

  const potentialProfit = products.reduce((sum, product) => {
    const priceInfo = pricesMap.get(product.id);
    const finalPrice = priceInfo ? priceInfo.price : product.price;
    const profit = product.stock * (finalPrice - (product.acqPrice || 0));
    return sum + profit;
  }, 0);

  return potentialProfit;
}
