import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { endOfYear, getMonth, startOfYear } from "date-fns";
import {
  createSettledMarketplaceSalesWhere,
  getMarketplaceNetRevenue,
  getMarketplaceSaleDate,
} from "@/lib/mercadolibre/reporting";

interface GraphData {
  name: string;
  total: number;
  subtotal: number;
  discounts: number;
  couponDiscounts: number;
  marketplaceRevenue: number;
}

export const getGraphRevenue = async (
  storeId: string,
  year: number,
): Promise<GraphData[]> => {
  const yearDate = new Date(year, 0, 1);
  const startDate = startOfYear(yearDate);
  const endDate = endOfYear(yearDate);

  const [paidOrders, marketplaceOrders] = await Promise.all([
    prismadb.order.findMany({
      where: {
        storeId,
        status: {
          in: [OrderStatus.PAID, OrderStatus.SENT],
        },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        createdAt: true,
        total: true,
        subtotal: true,
        discount: true,
        couponDiscount: true,
      },
    }),
    prismadb.marketplaceOrder.findMany({
      where: createSettledMarketplaceSalesWhere(storeId, {
        start: startDate,
        end: endDate,
      }),
      select: { netAmount: true, paidAt: true, createdAt: true },
    }),
  ]);

  const monthlyRevenue: { [key: number]: GraphData } = {};
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  months.forEach((name, index) => {
    monthlyRevenue[index] = {
      name,
      total: 0,
      subtotal: 0,
      discounts: 0,
      couponDiscounts: 0,
      marketplaceRevenue: 0,
    };
  });

  for (const order of paidOrders) {
    const month = getMonth(order.createdAt);
    monthlyRevenue[month].total += order.total;
    monthlyRevenue[month].subtotal += order.subtotal;
    monthlyRevenue[month].discounts += order.discount;
    monthlyRevenue[month].couponDiscounts += order.couponDiscount;
  }

  for (const order of marketplaceOrders) {
    const month = getMonth(getMarketplaceSaleDate(order));
    const netRevenue = getMarketplaceNetRevenue(order);
    monthlyRevenue[month].total += netRevenue;
    monthlyRevenue[month].marketplaceRevenue += netRevenue;
  }

  return Object.values(monthlyRevenue);
};
