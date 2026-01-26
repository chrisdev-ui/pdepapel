import prisma from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { endOfYear, startOfYear } from "date-fns";

export const getAverageOrderValue = async (
  storeId: string,
  year: number,
): Promise<number> => {
  const yearDate = new Date(year, 0, 1);
  const firstDayOfYear = startOfYear(yearDate);
  const lastDayOfYear = endOfYear(yearDate);

  const orders = await prisma.order.findMany({
    where: {
      storeId,
      status: {
        in: [OrderStatus.PAID, OrderStatus.SENT],
      },
      createdAt: {
        gte: firstDayOfYear,
        lte: lastDayOfYear,
      },
    },
    select: {
      total: true,
    },
  });

  if (orders.length === 0) {
    return 0;
  }

  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  return totalRevenue / orders.length;
};
