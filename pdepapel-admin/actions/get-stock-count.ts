import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export const getStockCount = async (storeId: string) => {
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
    },
  });

  const stockCount = products.reduce(
    (total, product) => total + (product.stock || 0),
    0,
  );

  return stockCount;
};
