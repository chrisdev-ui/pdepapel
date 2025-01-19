import prismadb from "@/lib/prismadb";
import { compareAsc, format, parseISO } from "date-fns";

export async function getSalesData(storeId: string, year: number) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const sales = await prismadb.order.findMany({
    where: {
      storeId: storeId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: "PAID",
    },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const salesByDate = sales.reduce(
    (acc, sale) => {
      const date = format(sale.createdAt, "yyyy-MM-dd");
      if (!acc[date]) {
        acc[date] = { revenue: 0, orders: 0 };
      }
      acc[date].orders += 1;
      acc[date].revenue += sale.orderItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      );
      return acc;
    },
    {} as Record<string, { revenue: number; orders: number }>,
  );

  return Object.entries(salesByDate)
    .sort(([dateA], [dateB]) => compareAsc(parseISO(dateA), parseISO(dateB)))
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
    }));
}
