import { requireStoreOwner } from "@/lib/store-access";
import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { endOfYear, startOfYear } from "date-fns";
import {
  createSettledMarketplaceSalesWhere,
  getMarketplaceNetRevenue,
} from "@/lib/mercadolibre/reporting";
import { revenueOrderWhere } from "@/lib/revenue-orders";

export const getTotalRevenue = async (storeId: string, year: number) => {
  await requireStoreOwner(storeId);
  const yearDate = new Date(year, 0, 1);
  const firstDayOfYear = startOfYear(yearDate);
  const lastDayOfYear = endOfYear(yearDate);

  const [paidOrders, marketplaceOrders] = await Promise.all([
    prismadb.order.findMany({
      where: {
        storeId,
        ...revenueOrderWhere(),
        createdAt: {
          gte: firstDayOfYear,
          lte: lastDayOfYear,
        },
      },
      select: {
        total: true,
      },
    }),
    prismadb.marketplaceOrder.findMany({
      where: createSettledMarketplaceSalesWhere(storeId, {
        start: firstDayOfYear,
        end: lastDayOfYear,
      }),
      select: { netAmount: true },
    }),
  ]);

  const totalRevenue =
    paidOrders.reduce((total, order) => total + order.total, 0) +
    marketplaceOrders.reduce(
      (total, order) => total + getMarketplaceNetRevenue(order),
      0,
    );

  return Math.round(totalRevenue * 100) / 100;
};
