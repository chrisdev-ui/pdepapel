import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { endOfYear, startOfYear } from "date-fns";

export const getTotalRevenue = async (storeId: string, year: number) => {
  const yearDate = new Date(year, 0, 1);
  const firstDayOfYear = startOfYear(yearDate);
  const lastDayOfYear = endOfYear(yearDate);

  const paidOrders = await prismadb.order.findMany({
    where: {
      storeId,
      status: {
        in: [OrderStatus.PAID, OrderStatus.SENT],
      },
      createdAt: {
        gte: firstDayOfYear,
        lt: lastDayOfYear,
      },
    },
    select: {
      orderItems: {
        select: {
          price: true,
        },
      },
    },
  });

  const totalRevenue = paidOrders.reduce(
    (total: number, order: { orderItems: { price: number }[] }) => {
      const orderTotal = order.orderItems.reduce(
        (sum: number, item: { price: number }) => sum + item.price,
        0,
      );
      return total + orderTotal;
    },
    0,
  );

  return totalRevenue;
};
