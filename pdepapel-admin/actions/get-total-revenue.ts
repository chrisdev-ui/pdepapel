import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";

export const getTotalRevenue = async (storeId: string, year: number) => {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const paidOrders = await prismadb.order.findMany({
    where: {
      storeId,
      status: OrderStatus.PAID,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
  });

  const totalRevenue = paidOrders.reduce((total, order) => {
    const orderTotal = order.orderItems.reduce((orderSum, item) => {
      return orderSum + Number(item.product.price) * item.quantity;
    }, 0);
    return total + orderTotal;
  }, 0);

  return totalRevenue;
};
