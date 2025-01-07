import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";

export const getSalesCount = async (storeId: string, year: number) => {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const salesCount = await prismadb.order.count({
    where: {
      storeId,
      status: OrderStatus.PAID,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
  });

  return salesCount;
};
