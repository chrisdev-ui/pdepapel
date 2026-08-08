import { MarketplaceOrderStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getMarketplaceItemNetRevenue } from "./reporting";

export type MercadoLibreListingProfitability = {
  listingId: string | null;
  title: string;
  productName: string | null;
  unitsSold: number;
  grossSales: number;
  netCollected: number;
  productCost: number;
  netProfit: number;
  marginPercentage: number | null;
  lastSaleAt: Date | null;
};

export async function getMercadoLibreListingProfitability(
  connectionId: string,
) {
  const orders = await prismadb.marketplaceOrder.findMany({
    where: {
      connectionId,
      status: MarketplaceOrderStatus.PAID,
      netAmount: { not: null },
    },
    select: {
      paidAt: true,
      createdAt: true,
      netAmount: true,
      items: {
        select: {
          listingId: true,
          title: true,
          quantity: true,
          unitPrice: true,
          listing: {
            select: {
              title: true,
              product: { select: { name: true, acqPrice: true } },
            },
          },
          product: { select: { name: true, acqPrice: true } },
        },
      },
    },
  });

  const result = new Map<string, MercadoLibreListingProfitability>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = item.listingId ?? `unlinked:${item.title}`;
      const current = result.get(key) ?? {
        listingId: item.listingId,
        title: item.listing?.title ?? item.title,
        productName: item.listing?.product.name ?? item.product?.name ?? null,
        unitsSold: 0,
        grossSales: 0,
        netCollected: 0,
        productCost: 0,
        netProfit: 0,
        marginPercentage: null,
        lastSaleAt: null,
      };
      const grossSales = item.unitPrice * item.quantity;
      const netCollected = getMarketplaceItemNetRevenue(order, item);
      const productCost =
        Number(item.listing?.product.acqPrice ?? item.product?.acqPrice ?? 0) *
        item.quantity;
      const saleDate = order.paidAt ?? order.createdAt;

      current.unitsSold += item.quantity;
      current.grossSales += grossSales;
      current.netCollected += netCollected;
      current.productCost += productCost;
      current.netProfit += netCollected - productCost;
      if (!current.lastSaleAt || saleDate > current.lastSaleAt) {
        current.lastSaleAt = saleDate;
      }
      result.set(key, current);
    }
  }

  return Array.from(result.values())
    .map((item) => ({
      ...item,
      marginPercentage:
        item.netCollected > 0
          ? (item.netProfit / item.netCollected) * 100
          : null,
    }))
    .sort((left, right) => right.netProfit - left.netProfit);
}
