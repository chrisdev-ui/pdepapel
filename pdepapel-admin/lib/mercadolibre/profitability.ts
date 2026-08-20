import { MarketplaceOrderStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import {
  getMarketplaceItemAcquisitionCost,
  getMarketplaceItemNetRevenue,
} from "./reporting";

export type MercadoLibreProfitabilityCostStatus =
  | "AVAILABLE"
  | "UNLINKED_PRODUCT"
  | "MISSING_ACQUISITION_COST";

export type MercadoLibreListingProfitability = {
  listingId: string | null;
  title: string;
  productName: string | null;
  unitsSold: number;
  grossSales: number;
  netCollected: number;
  productCost: number | null;
  netProfit: number | null;
  marginPercentage: number | null;
  costStatus: MercadoLibreProfitabilityCostStatus;
  pendingOrderIds: string[];
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
      externalOrderId: true,
      paidAt: true,
      createdAt: true,
      netAmount: true,
      items: {
        select: {
          listingId: true,
          productId: true,
          acqPrice: true,
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
        productCost: 0 as number | null,
        netProfit: 0 as number | null,
        marginPercentage: null,
        costStatus: "AVAILABLE" as MercadoLibreProfitabilityCostStatus,
        pendingOrderIds: [] as string[],
        lastSaleAt: null,
      };
      const grossSales = item.unitPrice * item.quantity;
      const netCollected = getMarketplaceItemNetRevenue(order, item);
      const acquisitionCost = getMarketplaceItemAcquisitionCost(item);
      const isLinked = Boolean(item.listingId ?? item.productId);
      const saleDate = order.paidAt ?? order.createdAt;

      // An item that never got linked to a local product, or a product without a
      // registered acquisition cost, must not be reported as pure profit.
      if (!isLinked) {
        current.costStatus = "UNLINKED_PRODUCT";
      } else if (
        acquisitionCost === null &&
        current.costStatus === "AVAILABLE"
      ) {
        current.costStatus = "MISSING_ACQUISITION_COST";
      }
      if (
        acquisitionCost === null &&
        !current.pendingOrderIds.includes(order.externalOrderId)
      ) {
        current.pendingOrderIds.push(order.externalOrderId);
      }

      const productCost = (acquisitionCost ?? 0) * item.quantity;

      current.unitsSold += item.quantity;
      current.grossSales += grossSales;
      current.netCollected += netCollected;
      current.productCost = (current.productCost ?? 0) + productCost;
      current.netProfit = (current.netProfit ?? 0) + netCollected - productCost;
      if (!current.lastSaleAt || saleDate > current.lastSaleAt) {
        current.lastSaleAt = saleDate;
      }
      result.set(key, current);
    }
  }

  return Array.from(result.values())
    .map((item) => {
      // The cost is unknown, not zero. Reporting it as zero inflates the profit
      // and shows a misleading 100% margin.
      if (item.costStatus !== "AVAILABLE") {
        return {
          ...item,
          productCost: null,
          netProfit: null,
          marginPercentage: null,
        };
      }
      return {
        ...item,
        marginPercentage:
          item.netCollected > 0 && item.netProfit !== null
            ? (item.netProfit / item.netCollected) * 100
            : null,
      };
    })
    .sort((left, right) => {
      if (left.netProfit === null && right.netProfit === null) {
        return right.netCollected - left.netCollected;
      }
      if (left.netProfit === null) return 1;
      if (right.netProfit === null) return -1;
      return right.netProfit - left.netProfit;
    });
}
