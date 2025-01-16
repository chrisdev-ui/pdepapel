import prismadb from "@/lib/prismadb";

export const getOutOfStockCount = async (storeId: string) => {
  const outOfStockCount = await prismadb.product.count({
    where: {
      storeId,
      stock: 0,
    },
  });

  return outOfStockCount;
};
