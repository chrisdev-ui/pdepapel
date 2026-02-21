import prismadb from "@/lib/prismadb";
import { OrderStatus } from "@prisma/client";
import { endOfYear, startOfYear } from "date-fns";

interface CategoryStats {
  sales: number;
  orders: number;
  discountedSales: number;
}

export async function getCategorySales(storeId: string, year: number) {
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
      status: {
        in: [OrderStatus.PAID, OrderStatus.SENT],
      },
    },
    select: {
      subtotal: true,
      total: true,
      discount: true,
      couponDiscount: true,
      orderItems: {
        select: {
          quantity: true,
          product: {
            select: {
              price: true,
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const categorySales = sales.reduce(
    (acc, order) => {
      const totalDiscount = order.discount + order.couponDiscount;

      order.orderItems.forEach((item) => {
        if (!item.product) return;

        const category = item.product.category.name;
        if (!acc[category]) {
          acc[category] = {
            sales: 0,
            orders: 0,
            discountedSales: 0,
          };
        }

        const itemSubtotal = item.product.price * item.quantity;

        const itemProportion = itemSubtotal / order.subtotal;

        const itemDiscount = totalDiscount * itemProportion;

        const discountedAmount = itemSubtotal - itemDiscount;

        acc[category].sales += itemSubtotal;
        acc[category].discountedSales += discountedAmount;
        acc[category].orders += item.quantity;
      });
      return acc;
    },
    {} as Record<string, CategoryStats>,
  );

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return Object.entries(categorySales)
    .map(([category, stats]) => ({
      category,
      grossSales: round2(stats.sales),
      netSales: round2(stats.discountedSales),
      orders: stats.orders,
      discountImpact: round2(stats.sales - stats.discountedSales),
      discountPercentage: round2(
        ((stats.sales - stats.discountedSales) / stats.sales) * 100,
      ),
    }))
    .sort((a, b) => {
      return b.netSales - a.netSales;
    });
}
