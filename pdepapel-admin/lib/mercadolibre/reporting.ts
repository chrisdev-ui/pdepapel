import { MarketplaceOrderStatus, type Prisma } from "@prisma/client";

export type MarketplaceReportingPeriod = {
  start: Date;
  end: Date;
};

export type MarketplaceReportingItem = {
  quantity: number;
  unitPrice: number;
  product?: { acqPrice: number | null } | null;
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

export function getMarketplaceOrderNetProfit(order: MarketplaceReportingOrder) {
  const productCost = order.items.reduce(
    (total, item) =>
      total + Number(item.product?.acqPrice ?? 0) * item.quantity,
    0,
  );

  return getMarketplaceNetRevenue(order) - productCost;
}
