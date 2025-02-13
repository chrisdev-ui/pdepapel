import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { endOfYear, startOfYear } from "date-fns";

export const getSalesCount = async (storeId: string, year: number) => {
  const yearDate = new Date(year, 0, 1);
  const firstDayOfYear = startOfYear(yearDate);
  const lastDayOfYear = endOfYear(yearDate);

  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      status: OrderStatus.PAID,
      createdAt: {
        gte: firstDayOfYear,
        lt: lastDayOfYear,
      },
    },
    select: {
      subtotal: true,
      total: true,
      discount: true,
      discountType: true,
      couponDiscount: true,
      orderItems: {
        select: {
          quantity: true,
        },
      },
      coupon: {
        select: {
          code: true,
          type: true,
        },
      },
    },
  });

  const stats = {
    totalSales: orders.length,
    totalItems: 0,
    totalDiscounts: 0,
    totalCouponDiscounts: 0,
    ordersWithDiscount: 0,
    ordersWithCoupon: 0,
    totalGrossRevenue: 0,
    totalNetRevenue: 0,
    averageDiscount: 0,
    averageCouponDiscount: 0,
    averageOrderValue: 0,
  };

  orders.forEach((order) => {
    // Calculate total items sold
    stats.totalItems += order.orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    stats.totalGrossRevenue += order.subtotal;
    stats.totalNetRevenue += order.total;

    if (order.discount > 0) {
      stats.totalDiscounts += order.discount;
      stats.ordersWithDiscount++;
    }

    if (order.couponDiscount > 0) {
      stats.totalCouponDiscounts += order.couponDiscount;
      stats.ordersWithCoupon++;
    }
  });

  stats.averageDiscount =
    stats.ordersWithDiscount > 0
      ? stats.totalDiscounts / stats.ordersWithDiscount
      : 0;

  stats.averageCouponDiscount =
    stats.ordersWithCoupon > 0
      ? stats.totalCouponDiscounts / stats.ordersWithCoupon
      : 0;

  stats.averageOrderValue =
    orders.length > 0 ? stats.totalNetRevenue / orders.length : 0;

  return stats;
};
