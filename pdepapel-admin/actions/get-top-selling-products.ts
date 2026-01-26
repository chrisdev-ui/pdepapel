"use server";

import prisma from "@/lib/prismadb";
import { endOfYear, startOfYear } from "date-fns";

export const getTopSellingProducts = async (storeId: string, year: number) => {
  const yearDate = new Date(year, 0, 1);
  const startDate = startOfYear(yearDate);
  const endDate = endOfYear(yearDate);

  const topSellingProducts = await prisma.product.findMany({
    where: {
      storeId: storeId,
      orderItems: {
        some: {
          order: {
            status: { in: ["PAID", "SENT"] },
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      price: true,
      images: {
        where: {
          isMain: true,
        },
        select: {
          url: true,
        },
      },
      orderItems: {
        where: {
          order: {
            status: { in: ["PAID", "SENT"] },
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
    },
  });

  // Calculate total sold items within the date range and sort
  const productsWithSales = topSellingProducts
    .map((product) => ({
      ...product,
      totalSold: product.orderItems.length,
    }))
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 10);

  // Remove the orderItems from the final result
  return productsWithSales.map(({ orderItems, ...rest }) => rest);
};
