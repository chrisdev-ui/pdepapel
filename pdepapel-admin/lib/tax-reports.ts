import { MarketplaceOrderStatus, OrderStatus } from "@prisma/client";

import { getMarketplaceSaleDate } from "@/lib/mercadolibre/reporting";
import prismadb from "@/lib/prismadb";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COLOMBIA_UTC_OFFSET_HOURS = 5;

export const DEFAULT_TAX_REPORT_PERIOD = {
  startDate: "2025-07-01",
  endDate: "2025-12-31",
};

export const TAX_SALES_DATE_BASIS = {
  SALE_DATE: "saleDate",
  PAYMENT_DATE: "paymentDate",
} as const;

export type TaxSalesDateBasis =
  (typeof TAX_SALES_DATE_BASIS)[keyof typeof TAX_SALES_DATE_BASIS];

export type TaxReportPeriod = {
  startDate: string;
  endDate: string;
  start: Date;
  endExclusive: Date;
};

export type TaxSaleRow = {
  orderNumber: string;
  customerName: string;
  channel: "Tienda en línea" | "Mercado Libre";
  totalAmount: number;
  occurredAt: Date;
};

export type TaxPurchaseRow = {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: number;
  issuedAt: Date;
  notes: string | null;
};

export type TaxReport = {
  period: TaxReportPeriod;
  salesDateBasis: TaxSalesDateBasis;
  sales: TaxSaleRow[];
  purchases: TaxPurchaseRow[];
  salesTotal: number;
  purchasesTotal: number;
  pendingMarketplaceSalesCount: number;
};

function toColombiaStartOfDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(
    Date.UTC(year, month - 1, day, COLOMBIA_UTC_OFFSET_HOURS),
  );

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Fecha inválida");
  }

  return parsed;
}

export function createTaxReportPeriod(
  startDate: string,
  endDate: string,
): TaxReportPeriod {
  if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    throw new Error("Las fechas deben tener el formato AAAA-MM-DD");
  }

  const start = toColombiaStartOfDay(startDate);
  const endInclusive = toColombiaStartOfDay(endDate);

  if (start > endInclusive) {
    throw new Error("La fecha inicial no puede ser posterior a la fecha final");
  }

  const endExclusive = new Date(endInclusive);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  return { startDate, endDate, start, endExclusive };
}

export function parseTaxSalesDateBasis(
  value: string | null | undefined,
): TaxSalesDateBasis {
  if (!value || value === TAX_SALES_DATE_BASIS.SALE_DATE) {
    return TAX_SALES_DATE_BASIS.SALE_DATE;
  }

  if (value === TAX_SALES_DATE_BASIS.PAYMENT_DATE) {
    return TAX_SALES_DATE_BASIS.PAYMENT_DATE;
  }

  throw new Error("El criterio de fecha de ventas no es válido");
}

export function createTaxSalesDateFilter(
  period: TaxReportPeriod,
  salesDateBasis: TaxSalesDateBasis,
) {
  const dateRange = {
    gte: period.start,
    lt: period.endExclusive,
  };

  return salesDateBasis === TAX_SALES_DATE_BASIS.PAYMENT_DATE
    ? { paidAt: dateRange }
    : { createdAt: dateRange };
}

export async function getTaxReport(
  storeId: string,
  period: TaxReportPeriod,
  salesDateBasis: TaxSalesDateBasis = TAX_SALES_DATE_BASIS.SALE_DATE,
): Promise<TaxReport> {
  const marketplaceDateFilter =
    salesDateBasis === TAX_SALES_DATE_BASIS.PAYMENT_DATE
      ? { paidAt: { gte: period.start, lt: period.endExclusive } }
      : {
          OR: [
            { paidAt: { gte: period.start, lt: period.endExclusive } },
            {
              paidAt: null,
              createdAt: { gte: period.start, lt: period.endExclusive },
            },
          ],
        };

  const [orders, marketplaceOrders, pendingMarketplaceSalesCount, purchases] =
    await Promise.all([
      prismadb.order.findMany({
        where: {
          storeId,
          status: {
            in: [OrderStatus.PAID, OrderStatus.SENT],
          },
          ...createTaxSalesDateFilter(period, salesDateBasis),
        },
        select: {
          orderNumber: true,
          fullName: true,
          total: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prismadb.marketplaceOrder.findMany({
        where: {
          connection: { storeId },
          status: MarketplaceOrderStatus.PAID,
          netAmount: { not: null },
          ...marketplaceDateFilter,
        },
        select: {
          externalOrderId: true,
          buyerName: true,
          netAmount: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: { paidAt: "asc" },
      }),
      prismadb.marketplaceOrder.count({
        where: {
          connection: { storeId },
          status: MarketplaceOrderStatus.PAID,
          netAmount: null,
          ...marketplaceDateFilter,
        },
      }),
      prismadb.taxPurchase.findMany({
        where: {
          storeId,
          issuedAt: {
            gte: period.start,
            lt: period.endExclusive,
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          supplierName: true,
          totalAmount: true,
          issuedAt: true,
          notes: true,
        },
        orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
      }),
    ]);

  const sales = [
    ...orders.map((order) => ({
      orderNumber: order.orderNumber,
      customerName: order.fullName.trim() || "Consumidor final",
      channel: "Tienda en línea" as const,
      totalAmount: order.total,
      occurredAt:
        salesDateBasis === TAX_SALES_DATE_BASIS.PAYMENT_DATE
          ? (order.paidAt ?? order.createdAt)
          : order.createdAt,
    })),
    ...marketplaceOrders.map((order) => ({
      orderNumber: `ML-${order.externalOrderId}`,
      customerName: order.buyerName?.trim() || "Consumidor final",
      channel: "Mercado Libre" as const,
      totalAmount: Number(order.netAmount ?? 0),
      occurredAt: getMarketplaceSaleDate(order),
    })),
  ].sort(
    (first, second) => first.occurredAt.getTime() - second.occurredAt.getTime(),
  );

  const purchaseRows = purchases.map((purchase) => ({
    ...purchase,
    totalAmount: purchase.totalAmount.toNumber(),
  }));

  return {
    period,
    salesDateBasis,
    sales,
    purchases: purchaseRows,
    salesTotal: sales.reduce((total, sale) => total + sale.totalAmount, 0),
    purchasesTotal: purchaseRows.reduce(
      (total, purchase) => total + purchase.totalAmount,
      0,
    ),
    pendingMarketplaceSalesCount,
  };
}
