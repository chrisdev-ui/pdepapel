import prismadb from "@/lib/prismadb";
import { formatter } from "@/lib/utils";

interface CategoryStats {
  sales: number;
  orders: number;
}

export async function getCategorySales(storeId: string, year: number) {
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
          product: {
            include: {
              category: true,
            },
          },
        },
      },
    },
  });

  const categorySales = sales.reduce(
    (acc, sale) => {
      sale.orderItems.forEach((item) => {
        const category = item.product.category.name;
        if (!acc[category]) {
          acc[category] = {
            sales: 0,
            orders: 0,
          };
        }
        acc[category].sales += item.product.price * item.quantity;
        acc[category].orders += item.quantity;
      });
      return acc;
    },
    {} as Record<string, CategoryStats>,
  );

  return Object.entries(categorySales).map(([category, stats]) => ({
    category,
    sales: formatter.format(stats.sales),
    orders: stats.orders,
  }));
}
