import { CAPSULAS_SORPRESA_ID, KITS_ID } from "@/constants";
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
        notIn: [CAPSULAS_SORPRESA_ID, KITS_ID],
      },
    },
  });

  return lowStockCount;
};
