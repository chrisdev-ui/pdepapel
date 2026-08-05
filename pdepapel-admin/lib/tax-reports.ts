import { OrderStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COLOMBIA_UTC_OFFSET_HOURS = 5;

export const DEFAULT_TAX_REPORT_PERIOD = {
  startDate: "2025-07-01",
  endDate: "2025-12-31",
};

export type TaxReportPeriod = {
  startDate: string;
  endDate: string;
  start: Date;
  endExclusive: Date;
};

export type TaxSaleRow = {
  orderNumber: string;
  customerName: string;
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
  sales: TaxSaleRow[];
  purchases: TaxPurchaseRow[];
  salesTotal: number;
  purchasesTotal: number;
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

export async function getTaxReport(
  storeId: string,
  period: TaxReportPeriod,
): Promise<TaxReport> {
  const [orders, purchases] = await Promise.all([
    prismadb.order.findMany({
      where: {
        storeId,
        status: {
          in: [OrderStatus.PAID, OrderStatus.SENT],
        },
        OR: [
          {
            paidAt: {
              gte: period.start,
              lt: period.endExclusive,
            },
          },
          {
            paidAt: null,
            createdAt: {
              gte: period.start,
              lt: period.endExclusive,
            },
          },
        ],
      },
      select: {
        orderNumber: true,
        fullName: true,
        total: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
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

  const sales = orders.map((order) => ({
    orderNumber: order.orderNumber,
    customerName: order.fullName.trim() || "Consumidor final",
    totalAmount: order.total,
    occurredAt: order.paidAt ?? order.createdAt,
  }));

  const purchaseRows = purchases.map((purchase) => ({
    ...purchase,
    totalAmount: purchase.totalAmount.toNumber(),
  }));

  return {
    period,
    sales,
    purchases: purchaseRows,
    salesTotal: sales.reduce((total, sale) => total + sale.totalAmount, 0),
    purchasesTotal: purchaseRows.reduce(
      (total, purchase) => total + purchase.totalAmount,
      0,
    ),
  };
}
