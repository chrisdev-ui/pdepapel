import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
import prismadb from "@/lib/prismadb";

export const getOutOfStockCount = async (storeId: string) => {
  const outOfStockCount = await prismadb.product.count({
    where: {
      storeId,
      stock: 0,
      categoryId: {
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
  });

  return outOfStockCount;
};
