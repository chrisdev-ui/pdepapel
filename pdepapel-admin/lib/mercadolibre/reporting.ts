import { MarketplaceOrderStatus, type Prisma } from "@prisma/client";

export type MarketplaceReportingPeriod = {
  start: Date;
  end: Date;
};

export type MarketplaceReportingItem = {
  quantity: number;
  unitPrice: number;
  /**
   * Acquisition cost captured when the sale was synchronized. A paid sale is a
   * historical record, so this snapshot wins over the product's current cost.
   */
  acqPrice?: number | null;
  product?: { acqPrice: number | null } | null;
  listing?: { product: { acqPrice: number | null } } | null;
};

export type MarketplaceReportingOrder = {
  netAmount: number | null;
  paidAt: Date | null;
  createdAt: Date;
  items: MarketplaceReportingItem[];
};

export function createSettledMarketplaceSalesWhere(
  storeId: string,
  period?: MarketplaceReportingPeriod,
): Prisma.MarketplaceOrderWhereInput {
  return {
    connection: { storeId },
    status: MarketplaceOrderStatus.PAID,
    netAmount: { not: null },
    ...(period
      ? {
          paidAt: {
            gte: period.start,
            lte: period.end,
          },
        }
      : {}),
  };
}

export function getMarketplaceSaleDate(
  order: Pick<MarketplaceReportingOrder, "paidAt" | "createdAt">,
) {
  return order.paidAt ?? order.createdAt;
}

export function getMarketplaceNetRevenue(
  order: Pick<MarketplaceReportingOrder, "netAmount">,
) {
  return Number(order.netAmount ?? 0);
}

export function getMarketplaceOrderItemGrossTotal(
  items: MarketplaceReportingItem[],
) {
  return items.reduce(
    (total, item) => total + Number(item.unitPrice) * item.quantity,
    0,
  );
}

export function getMarketplaceItemNetRevenue(
  order: Pick<MarketplaceReportingOrder, "netAmount" | "items">,
  item: MarketplaceReportingItem,
) {
  const itemsGrossTotal = getMarketplaceOrderItemGrossTotal(order.items);
  if (itemsGrossTotal <= 0) return 0;

  const itemGrossTotal = Number(item.unitPrice) * item.quantity;
  return (getMarketplaceNetRevenue(order) * itemGrossTotal) / itemsGrossTotal;
}

/**
 * Unit acquisition cost of a sold marketplace item, or `null` when it cannot be
 * established: the item was never linked to a local product, or that product has
 * no acquisition cost registered. A missing cost is NOT zero — reporting it as
 * zero turns an unknown into pure profit.
 */
export function getMarketplaceItemAcquisitionCost(
  item: MarketplaceReportingItem,
): number | null {
  const snapshot = Number(item.acqPrice ?? Number.NaN);
  if (Number.isFinite(snapshot) && snapshot > 0) return snapshot;

  const registeredCost = Number(
    item.listing?.product.acqPrice ?? item.product?.acqPrice ?? Number.NaN,
  );
  if (Number.isFinite(registeredCost) && registeredCost > 0) {
    return registeredCost;
  }

  return null;
}

export function getMarketplaceOrderNetProfit(order: MarketplaceReportingOrder) {
  const productCost = order.items.reduce(
    (total, item) =>
      total + (getMarketplaceItemAcquisitionCost(item) ?? 0) * item.quantity,
    0,
  );

  return getMarketplaceNetRevenue(order) - productCost;
}
