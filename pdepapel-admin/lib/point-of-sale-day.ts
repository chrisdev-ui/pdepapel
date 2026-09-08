import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

import { getColombiaDayBounds } from "@/lib/dashboard-today";
import prismadb from "@/lib/prismadb";

/**
 * Cierre del día del punto de venta.
 *
 * Reúne las ventas presenciales pagadas hoy (hora de Colombia) y las agrupa
 * por método de pago para que quien cierra caja pueda contrastar el efectivo
 * y las transferencias recibidas. Es una lectura: no mueve dinero ni stock.
 */

export type PointOfSaleDayMethod = "cash" | "transfer" | "other";

export interface PointOfSaleDaySale {
  id: string;
  orderNumber: string;
  total: number;
  units: number;
  method: PointOfSaleDayMethod;
  paidAt: Date;
}

export interface PointOfSaleMethodTotal {
  count: number;
  total: number;
}

export interface PointOfSaleDaySummary {
  sales: number;
  units: number;
  total: number;
  byMethod: Record<PointOfSaleDayMethod, PointOfSaleMethodTotal>;
  recent: PointOfSaleDaySale[];
  lastSaleAt: Date | null;
}

export interface PointOfSaleDayRawSale {
  id: string;
  orderNumber: string;
  total: number | { toString(): string };
  paidAt: Date | null;
  createdAt: Date;
  payment: { method: PaymentMethod | null } | null;
  orderItems: { quantity: number }[];
}

export const RECENT_SALES_LIMIT = 8;

export function methodForPayment(method: PaymentMethod | null | undefined): PointOfSaleDayMethod {
  if (method === PaymentMethod.CASH) return "cash";
  if (method === PaymentMethod.BankTransfer) return "transfer";
  return "other";
}

export const METHOD_LABELS: Record<PointOfSaleDayMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  other: "Otro método",
};

function emptyTotals(): Record<PointOfSaleDayMethod, PointOfSaleMethodTotal> {
  return {
    cash: { count: 0, total: 0 },
    transfer: { count: 0, total: 0 },
    other: { count: 0, total: 0 },
  };
}

export function buildPointOfSaleDaySummary(raw: PointOfSaleDayRawSale[]): PointOfSaleDaySummary {
  const sales = raw
    .map<PointOfSaleDaySale>((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.total),
      units: order.orderItems.reduce((sum, item) => sum + item.quantity, 0),
      method: methodForPayment(order.payment?.method),
      paidAt: order.paidAt ?? order.createdAt,
    }))
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

  const byMethod = emptyTotals();
  let units = 0;
  let total = 0;
  for (const sale of sales) {
    byMethod[sale.method].count += 1;
    byMethod[sale.method].total += sale.total;
    units += sale.units;
    total += sale.total;
  }

  return {
    sales: sales.length,
    units,
    total,
    byMethod,
    recent: sales.slice(0, RECENT_SALES_LIMIT),
    lastSaleAt: sales[0]?.paidAt ?? null,
  };
}

export async function getPointOfSaleDaySummary(
  storeId: string,
  now = new Date(),
): Promise<PointOfSaleDaySummary> {
  const { start, end } = getColombiaDayBounds(now);
  const orders = await prismadb.order.findMany({
    where: {
      storeId,
      type: OrderType.POINT_OF_SALE,
      status: { in: [OrderStatus.PAID, OrderStatus.SENT] },
      paidAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      paidAt: true,
      createdAt: true,
      payment: { select: { method: true } },
      orderItems: { select: { quantity: true } },
    },
    orderBy: { paidAt: "desc" },
  });
  return buildPointOfSaleDaySummary(orders);
}
