import prisma from "@/lib/prismadb";

export const getAverageOrderValue = async (
  storeId: string,
  year: number,
): Promise<number> => {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      orderItems: {
        select: {
          quantity: true,
          product: {
            select: {
              price: true,
            },
          },
        },
      },
    },
  });

  if (orders.length === 0) {
    return 0;
  }

  const totalRevenue = orders.reduce((sum, order) => {
    const orderTotal = order.orderItems.reduce(
      (orderSum, item) => orderSum + item.quantity * item.product.price,
      0,
    );
    return sum + orderTotal;
  }, 0);

  return totalRevenue / orders.length;
};
