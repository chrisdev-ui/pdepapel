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
    },
  });

  return lowStockCount;
};
