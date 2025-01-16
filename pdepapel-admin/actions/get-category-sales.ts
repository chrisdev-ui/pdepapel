import prismadb from "@/lib/prismadb";

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
          acc[category] = 0;
        }
        acc[category] += item.product.price * item.quantity;
      });
      return acc;
    },
    {} as Record<string, number>,
  );

  return Object.entries(categorySales).map(([category, sales]) => ({
    category,
    sales,
  }));
}
