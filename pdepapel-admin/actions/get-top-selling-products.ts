import prisma from "@/lib/prismadb";

export const getTopSellingProducts = async (storeId: string, year: number) => {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const topSellingProducts = await prisma.product.findMany({
    where: {
      storeId: storeId,
      orderItems: {
        some: {
          order: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    },
    orderBy: {
      orderItems: {
        _count: "desc",
      },
    },
    take: 5,
    select: {
      id: true,
      name: true,
      price: true,
      images: {
        where: {
          isMain: true,
        },
        select: {
          url: true,
        },
      },
      _count: {
        select: {
          orderItems: true,
        },
      },
    },
  });

  return topSellingProducts.map((product) => ({
    ...product,
    totalSold: product._count.orderItems,
  }));
};
