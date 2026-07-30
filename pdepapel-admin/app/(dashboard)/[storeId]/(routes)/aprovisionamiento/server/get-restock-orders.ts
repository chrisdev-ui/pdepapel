import prismadb from "@/lib/prismadb";

export const getRestockOrders = async (storeId: string) => {
  const restockOrders = await prismadb.restockOrder.findMany({
    where: {
      storeId,
    },
    include: {
      supplier: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return restockOrders;
};
