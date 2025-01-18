import { CAPSULAS_SORPRESA_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export const getLowStockCount = async (
  storeId: string,
  treshold: number = 5,
) => {
  const lowStockCount = await prismadb.product.count({
    where: {
      storeId,
      stock: {
        lte: treshold,
      },
      categoryId: {
        not: CAPSULAS_SORPRESA_ID,
      },
    },
  });

  return lowStockCount;
};
