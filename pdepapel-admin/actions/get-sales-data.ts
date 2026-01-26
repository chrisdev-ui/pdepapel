import prismadb from "@/lib/prismadb";
import { compareAsc, endOfYear, format, parseISO, startOfYear } from "date-fns";

interface SalesByDate {
  revenue: number;
  orders: number;
  items: number;
  discounts: number;
  couponDiscounts: number;
  grossRevenue: number;
  averageOrderValue: number;
}

export async function getSalesData(storeId: string, year: number) {
  const yearDate = new Date(year, 0, 1);
  const startDate = startOfYear(yearDate);
  const endDate = endOfYear(yearDate);

  const sales = await prismadb.order.findMany({
    where: {
      storeId: storeId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: { in: ["PAID", "SENT"] },
    },
    select: {
      createdAt: true,
      total: true,
      subtotal: true,
      discount: true,
      couponDiscount: true,
      orderItems: {
        select: {
          quantity: true,
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
        acc[date] = {
          revenue: 0,
          orders: 0,
          items: 0,
          discounts: 0,
          couponDiscounts: 0,
          grossRevenue: 0,
          averageOrderValue: 0,
        };
      }

      // Sum up total items for this order
      const totalItems = sale.orderItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

      acc[date].orders += 1;
      acc[date].items += totalItems;
      acc[date].revenue += sale.total;
      acc[date].discounts += sale.discount;
      acc[date].couponDiscounts += sale.couponDiscount;
      acc[date].grossRevenue += sale.subtotal;

      // Calculate average order value for this date
      acc[date].averageOrderValue = acc[date].revenue / acc[date].orders;

      return acc;
    },
    {} as Record<string, SalesByDate>,
  );

  return Object.entries(salesByDate)
    .sort(([dateA], [dateB]) => compareAsc(parseISO(dateA), parseISO(dateB)))
    .map(([date, data]) => ({
      date,
      ...data,
    }));
}
