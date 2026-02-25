import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  subMonths,
} from "date-fns";
import { getColombiaDate } from "@/lib/date-utils";

export interface MonthlySummary {
  total_revenue: number;
  total_net_profit: number;
  average_margin: number;
  total_orders: number;
}

export interface DailyBreakdown {
  date: string;
  revenue: number;
  profit: number;
}

export interface MonthOverMonth {
  currentMonth: MonthlySummary;
  previousMonth: MonthlySummary;
  percentageChange: {
    revenue: number;
    net_profit: number;
    orders: number;
  };
}

/**
 * Gets aggregated financial summary for a specific month using the persisted financial fields.
 */
export async function getMonthlyFinancialSummary(
  storeId: string,
  year: number,
  month: number, // 1-indexed (1=Jan, 12=Dec)
): Promise<MonthlySummary> {
  // Use Colombia timezone aware dates
  const targetDate = new Date(year, month - 1, 1);
  const start = startOfMonth(targetDate);
  const end = endOfMonth(targetDate);

  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
      paidAt: {
        gte: start,
        lte: end,
      },
    } as any,
    // select: {
    //   total: true,
    //   netProfit: true,
    //   profitMarginPct: true,
    // },
  });

  const total_revenue = orders.reduce(
    (sum, order) => sum + (order.subtotal || 0),
    0,
  );
  const total_net_profit = orders.reduce(
    (sum, order) => sum + ((order as any).netProfit || 0),
    0,
  );
  const total_orders = orders.length;

  const average_margin =
    total_revenue > 0 ? (total_net_profit / total_revenue) * 100 : 0;

  return {
    total_revenue,
    total_net_profit,
    average_margin,
    total_orders,
  };
}

/**
 * Gets daily breakdown of revenue and profit for Recharts <AreaChart> or <LineChart>
 */
export async function getDailyFinancialBreakdown(
  storeId: string,
  year: number,
  month: number,
): Promise<DailyBreakdown[]> {
  const targetDate = new Date(year, month - 1, 1);
  const start = startOfMonth(targetDate);
  const end = endOfMonth(targetDate);

  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
      paidAt: {
        gte: start,
        lte: end,
      },
    } as any,
    // select: {
    //   total: true,
    //   netProfit: true,
    //   paidAt: true,
    // },
  });

  const daysInMonth = eachDayOfInterval({ start, end });

  // Initialize map with all days in month
  const dailyMap = new Map<string, { revenue: number; profit: number }>();
  for (const day of daysInMonth) {
    dailyMap.set(format(day, "yyyy-MM-dd"), { revenue: 0, profit: 0 });
  }

  // Aggregate orders into daily buckets
  for (const order of orders) {
    if (!(order as any).paidAt) continue;

    // Ensure we group by the local date
    const dateStr = format((order as any).paidAt, "yyyy-MM-dd");
    const existing = dailyMap.get(dateStr) || { revenue: 0, profit: 0 };

    dailyMap.set(dateStr, {
      revenue: existing.revenue + (order.subtotal || 0),
      profit: existing.profit + ((order as any).netProfit || 0),
    });
  }

  // Convert map to array sorted by date suitable for Recharts
  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    revenue: data.revenue,
    profit: data.profit,
  }));
}

/**
 * Gets a month-over-month comparison using the persisted financial data
 */
export async function getMonthOverMonthComparison(
  storeId: string,
  year: number,
  month: number,
): Promise<MonthOverMonth> {
  const currentMonthDate = new Date(year, month - 1, 1);
  const previousMonthDate = subMonths(currentMonthDate, 1);

  const currentMonthData = await getMonthlyFinancialSummary(
    storeId,
    year,
    month,
  );
  const previousMonthData = await getMonthlyFinancialSummary(
    storeId,
    previousMonthDate.getFullYear(),
    previousMonthDate.getMonth() + 1,
  );

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  return {
    currentMonth: currentMonthData,
    previousMonth: previousMonthData,
    percentageChange: {
      revenue: calculateChange(
        currentMonthData.total_revenue,
        previousMonthData.total_revenue,
      ),
      net_profit: calculateChange(
        currentMonthData.total_net_profit,
        previousMonthData.total_net_profit,
      ),
      orders: calculateChange(
        currentMonthData.total_orders,
        previousMonthData.total_orders,
      ),
    },
  };
}
