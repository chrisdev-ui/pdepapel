import prismadb from "@/lib/prismadb";
import { compareAsc, endOfYear, format, parseISO, startOfYear } from "date-fns";
import {
  createSettledMarketplaceSalesWhere,
  getMarketplaceNetRevenue,
  getMarketplaceSaleDate,
} from "@/lib/mercadolibre/reporting";

interface SalesByDate {
  revenue: number;
  orders: number;
  items: number;
  discounts: number;
  couponDiscounts: number;
  grossRevenue: number;
  marketplaceRevenue: number;
  averageOrderValue: number;
}

export async function getSalesData(storeId: string, year: number) {
  const yearDate = new Date(year, 0, 1);
  const startDate = startOfYear(yearDate);
  const endDate = endOfYear(yearDate);

  const [sales, marketplaceOrders] = await Promise.all([
    prismadb.order.findMany({
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
    }),
    prismadb.marketplaceOrder.findMany({
      where: createSettledMarketplaceSalesWhere(storeId, {
        start: startDate,
        end: endDate,
      }),
      select: {
        netAmount: true,
        paidAt: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
  ]);

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
          marketplaceRevenue: 0,
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

  marketplaceOrders.forEach((sale) => {
    const date = format(getMarketplaceSaleDate(sale), "yyyy-MM-dd");
    if (!salesByDate[date]) {
      salesByDate[date] = {
        revenue: 0,
        orders: 0,
        items: 0,
        discounts: 0,
        couponDiscounts: 0,
        grossRevenue: 0,
        marketplaceRevenue: 0,
        averageOrderValue: 0,
      };
    }

    const netRevenue = getMarketplaceNetRevenue(sale);
    salesByDate[date].orders += 1;
    salesByDate[date].items += sale.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    salesByDate[date].revenue += netRevenue;
    salesByDate[date].marketplaceRevenue += netRevenue;
    salesByDate[date].averageOrderValue =
      salesByDate[date].revenue / salesByDate[date].orders;
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return Object.entries(salesByDate)
    .sort(([dateA], [dateB]) => compareAsc(parseISO(dateA), parseISO(dateB)))
    .map(([date, data]) => ({
      date,
      ...data,
      revenue: round2(data.revenue),
      grossRevenue: round2(data.grossRevenue),
      marketplaceRevenue: round2(data.marketplaceRevenue),
      discounts: round2(data.discounts),
      couponDiscounts: round2(data.couponDiscounts),
      averageOrderValue: round2(data.averageOrderValue),
    }));
}
