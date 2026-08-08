"use server";

import { endOfYear, startOfYear } from "date-fns";

import { createSettledMarketplaceSalesWhere } from "@/lib/mercadolibre/reporting";
import prisma from "@/lib/prismadb";

export const getTopSellingProducts = async (storeId: string, year: number) => {
  const yearDate = new Date(year, 0, 1);
  const startDate = startOfYear(yearDate);
  const endDate = endOfYear(yearDate);

  const [storeOrderItems, marketplaceOrderItems] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          storeId,
          status: { in: ["PAID", "SENT"] },
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.marketplaceOrderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        marketplaceOrder: createSettledMarketplaceSalesWhere(storeId, {
          start: startDate,
          end: endDate,
        }),
      },
      _sum: { quantity: true },
    }),
  ]);

  const quantitiesByProductId = new Map<string, number>();
  for (const item of storeOrderItems) {
    if (!item.productId) continue;
    quantitiesByProductId.set(
      item.productId,
      (quantitiesByProductId.get(item.productId) ?? 0) +
        (item._sum.quantity ?? 0),
    );
  }
  for (const item of marketplaceOrderItems) {
    if (!item.productId) continue;
    quantitiesByProductId.set(
      item.productId,
      (quantitiesByProductId.get(item.productId) ?? 0) +
        (item._sum.quantity ?? 0),
    );
  }

  const productIds = Array.from(quantitiesByProductId.keys());
  if (productIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      storeId,
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
      price: true,
      images: {
        where: { isMain: true },
        select: { url: true },
      },
    },
  });

  return products
    .map((product) => ({
      ...product,
      totalSold: quantitiesByProductId.get(product.id) ?? 0,
    }))
    .sort((first, second) => second.totalSold - first.totalSold)
    .slice(0, 10);
};
