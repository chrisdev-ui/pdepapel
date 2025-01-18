import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export const getStockCount = async (storeId: string) => {
  const stockCount = await prismadb.product.count({
    where: {
      storeId,
      isArchived: false,
      categoryId: {
        not: CAPSULAS_SORPRESA_ID,
      },
    },
  });

  return stockCount;
};
