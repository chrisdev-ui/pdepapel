import prismadb from "@/lib/prismadb";

export const getProductGroups = async (storeId: string) => {
  const groups = await prismadb.productGroup.findMany({
    where: {
      storeId,
    },
    select: {
      id: true,
      name: true,
      products: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return groups;
};
