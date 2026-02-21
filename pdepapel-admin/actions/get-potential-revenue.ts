import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export async function getPotentialRevenue(storeId: string) {
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
      productGroupId: true,
    },
  });

  const { getProductsPrices } = await import("@/lib/discount-engine");
  const pricesMap = await getProductsPrices(products, storeId);

  const potentialRevenue = products.reduce((sum, product) => {
    const priceInfo = pricesMap.get(product.id);
    const finalPrice = priceInfo ? priceInfo.price : product.price;
    return sum + product.stock * finalPrice;
  }, 0);

  return Math.round(potentialRevenue * 100) / 100;
}
