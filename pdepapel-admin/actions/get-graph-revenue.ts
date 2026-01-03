import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/enums";
import { endOfYear, getMonth, startOfYear } from "date-fns";

interface GraphData {
  name: string;
  total: number;
  subtotal: number;
  discounts: number;
  couponDiscounts: number;
}

export const getGraphRevenue = async (
  storeId: string,
  year: number,
): Promise<GraphData[]> => {
  const yearDate = new Date(year, 0, 1);
  const startDate = startOfYear(yearDate);
  const endDate = endOfYear(yearDate);

  const paidOrders = await prismadb.order.findMany({
    where: {
      storeId,
      status: OrderStatus.PAID,
      createdAt: {
        gte: startDate,
        lt: endDate,
      },
    },
    select: {
      createdAt: true,
      total: true,
      subtotal: true,
      discount: true,
      couponDiscount: true,
    },
  });

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
    };
  });

  for (const order of paidOrders) {
    const month = getMonth(order.createdAt);
    monthlyRevenue[month].total += order.total;
    monthlyRevenue[month].subtotal += order.subtotal;
    monthlyRevenue[month].discounts += order.discount;
    monthlyRevenue[month].couponDiscounts += order.couponDiscount;
  }

  return Object.values(monthlyRevenue);
};
