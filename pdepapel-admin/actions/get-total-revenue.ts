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
      status: OrderStatus.PAID,
      createdAt: {
        gte: firstDayOfYear,
        lt: lastDayOfYear,
      },
    },
    select: {
      total: true,
    },
  });

  return paidOrders.reduce((total, order) => total + order.total, 0);
};
