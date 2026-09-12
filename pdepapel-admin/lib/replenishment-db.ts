import { MarketplaceOrderStatus, OrderStatus, RestockOrderStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

/**
 * Datos de reposición por producto: ventas recientes (tienda en línea, punto
 * de venta y ferias por `OrderItem`; Mercado Libre por `MarketplaceOrderItem`),
 * unidades en camino y último costo de compra. Todo por tienda, en pocas
 * consultas agregadas.
 */

const PAID_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SENT];
const OPEN_RESTOCK: RestockOrderStatus[] = [RestockOrderStatus.ORDERED, RestockOrderStatus.PARTIALLY_RECEIVED];

const since = (days: number, now: Date) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/** Unidades vendidas por producto desde `days` días atrás. */
export async function getUnitsSoldByProduct(storeId: string, days: number, now = new Date()): Promise<Map<string, number>> {
  const from = since(days, now);
  const [store, marketplace] = await Promise.all([
    prismadb.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, order: { storeId, status: { in: PAID_ORDER_STATUSES }, paidAt: { gte: from } } },
      _sum: { quantity: true },
    }),
    prismadb.marketplaceOrderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, marketplaceOrder: { status: MarketplaceOrderStatus.PAID, paidAt: { gte: from }, connection: { storeId } } },
      _sum: { quantity: true },
    }),
  ]);
  const totals = new Map<string, number>();
  for (const row of [...store, ...marketplace]) {
    if (!row.productId) continue;
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  }
  return totals;
}

/** Unidades pedidas a proveedores y todavía no recibidas, por producto. */
export async function getUnitsOnOrderByProduct(storeId: string): Promise<Map<string, number>> {
  const items = await prismadb.restockOrderItem.findMany({
    where: { restockOrder: { storeId, status: { in: OPEN_RESTOCK } } },
    select: { productId: true, quantity: true, quantityReceived: true },
  });
  const totals = new Map<string, number>();
  for (const item of items) {
    const pending = Math.max(0, item.quantity - item.quantityReceived);
    if (pending > 0) totals.set(item.productId, (totals.get(item.productId) ?? 0) + pending);
  }
  return totals;
}

export interface LastPurchase {
  cost: number;
  supplierId: string;
  at: Date;
}

/** Costo unitario de la última compra de cada producto (pedidos no cancelados). */
export async function getLastPurchaseByProduct(storeId: string): Promise<Map<string, LastPurchase>> {
  const items = await prismadb.restockOrderItem.findMany({
    where: { restockOrder: { storeId, status: { not: RestockOrderStatus.CANCELLED } } },
    select: { productId: true, cost: true, restockOrder: { select: { supplierId: true, createdAt: true } } },
    orderBy: { restockOrder: { createdAt: "desc" } },
  });
  const latest = new Map<string, LastPurchase>();
  for (const item of items) {
    if (!latest.has(item.productId)) {
      latest.set(item.productId, { cost: item.cost, supplierId: item.restockOrder.supplierId, at: item.restockOrder.createdAt });
    }
  }
  return latest;
}

export interface ReplenishmentContext {
  sold30: Map<string, number>;
  sold90: Map<string, number>;
  onOrder: Map<string, number>;
  lastPurchase: Map<string, LastPurchase>;
}

export async function getReplenishmentContext(storeId: string, now = new Date()): Promise<ReplenishmentContext> {
  const [sold30, sold90, onOrder, lastPurchase] = await Promise.all([
    getUnitsSoldByProduct(storeId, 30, now),
    getUnitsSoldByProduct(storeId, 90, now),
    getUnitsOnOrderByProduct(storeId),
    getLastPurchaseByProduct(storeId),
  ]);
  return { sold30, sold90, onOrder, lastPurchase };
}
