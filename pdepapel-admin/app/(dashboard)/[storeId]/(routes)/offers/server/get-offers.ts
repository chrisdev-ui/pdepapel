import prismadb from "@/lib/prismadb";

export const getOffers = async (storeId: string) => {
  const offers = await prismadb.offer.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      _count: {
        select: {
          products: true,
          categories: true,
          productGroups: true,
        },
      },
    },
  });

  return offers;
};
