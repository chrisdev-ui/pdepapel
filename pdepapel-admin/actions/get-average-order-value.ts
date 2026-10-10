import { requireStoreOwner } from "@/lib/store-access";
import prisma from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { endOfYear, startOfYear } from "date-fns";
import {
  createSettledMarketplaceSalesWhere,
  getMarketplaceNetRevenue,
} from "@/lib/mercadolibre/reporting";
import { revenueOrderWhere } from "@/lib/revenue-orders";

export const getAverageOrderValue = async (
  storeId: string,
  year: number,
): Promise<number> => {
  await requireStoreOwner(storeId);
  const yearDate = new Date(year, 0, 1);
  const firstDayOfYear = startOfYear(yearDate);
  const lastDayOfYear = endOfYear(yearDate);

  const [orders, marketplaceOrders] = await Promise.all([
    prisma.order.findMany({
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
    prisma.marketplaceOrder.findMany({
      where: createSettledMarketplaceSalesWhere(storeId, {
        start: firstDayOfYear,
        end: lastDayOfYear,
      }),
      select: { netAmount: true },
    }),
  ]);

  const salesCount = orders.length + marketplaceOrders.length;
  if (salesCount === 0) {
    return 0;
  }

  const totalRevenue =
    orders.reduce((sum, order) => sum + order.total, 0) +
    marketplaceOrders.reduce(
      (sum, order) => sum + getMarketplaceNetRevenue(order),
      0,
    );
  return Math.round((totalRevenue / salesCount) * 100) / 100;
};
