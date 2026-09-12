import { MarketplaceOrderStatus, OrderStatus, type Prisma, RestockOrderStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

/**
 * Datos de reposición por producto: ventas recientes (tienda en línea, punto
 * de venta y ferias por `OrderItem`; Mercado Libre por `MarketplaceOrderItem`),
 * unidades en camino y último costo de compra. Todo por tienda, en pocas
 * consultas agregadas.
 */

const PAID_ORDER_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SENT];
const OPEN_RESTOCK: RestockOrderStatus[] = [RestockOrderStatus.ORDERED, RestockOrderStatus.PARTIALLY_RECEIVED];
/** Pedidos a proveedor con mercancía ya recibida: los únicos cuyo costo es una compra real. */
const RECEIVED_RESTOCK: RestockOrderStatus[] = [RestockOrderStatus.PARTIALLY_RECEIVED, RestockOrderStatus.COMPLETED];
/** Un costo más viejo que esto ya no dice nada del proveedor. */
export const LAST_PURCHASE_WINDOW_DAYS = 365;

const since = (days: number, now: Date) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/**
 * Pedidos pagados desde `from`. `paidAt` manda; si un pedido pagado no lo
 * tiene (los anteriores al 2026-09-10 se rellenaron, pero la regla no se fía),
 * vale la fecha de creación para que la venta no desaparezca de la ventana.
 */
function paidOrderWhere(storeId: string, from: Date): Prisma.OrderWhereInput {
  return {
    storeId,
    status: { in: PAID_ORDER_STATUSES },
    OR: [{ paidAt: { gte: from } }, { paidAt: null, createdAt: { gte: from } }],
  };
}

/** Unidades vendidas por producto desde `days` días atrás. */
export async function getUnitsSoldByProduct(storeId: string, days: number, now = new Date()): Promise<Map<string, number>> {
  const from = since(days, now);
  const [store, marketplace] = await Promise.all([
    prismadb.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, order: paidOrderWhere(storeId, from) },
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

/**
 * Unidades vendidas de un solo producto: las suyas más las que salieron
 * dentro de kits que lo contienen. Misma regla que Inventario, para que el
 * kardex muestre la misma cifra.
 */
export async function getUnitsSoldForProduct(storeId: string, productId: string, days: number, now = new Date()): Promise<{ direct: number; viaKits: number }> {
  const from = since(days, now);
  const kits = await prismadb.productKit.findMany({ where: { componentId: productId, kit: { storeId } }, select: { kitId: true, quantity: true } });
  const productIds = [productId, ...kits.map((kit) => kit.kitId)];
  const [store, marketplace] = await Promise.all([
    prismadb.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, order: paidOrderWhere(storeId, from) },
      _sum: { quantity: true },
    }),
    prismadb.marketplaceOrderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, marketplaceOrder: { status: MarketplaceOrderStatus.PAID, paidAt: { gte: from }, connection: { storeId } } },
      _sum: { quantity: true },
    }),
  ]);
  const sold = new Map<string, number>();
  for (const row of [...store, ...marketplace]) {
    if (!row.productId) continue;
    sold.set(row.productId, (sold.get(row.productId) ?? 0) + (row._sum.quantity ?? 0));
  }
  const direct = sold.get(productId) ?? 0;
  const viaKits = kits.reduce((sum, kit) => sum + (sold.get(kit.kitId) ?? 0) * Math.max(0, kit.quantity), 0);
  return { direct, viaKits };
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
  /** Última actualización del pedido (la recepción que lo cerró o avanzó). */
  at: Date;
}

/**
 * Costo unitario de la última compra recibida de cada producto, dentro del
 * último año. Solo líneas con unidades recibidas y costo real: un borrador o
 * un pedido sin recibir no es una compra, y un costo 0 no es un costo.
 */
export async function getLastPurchaseByProduct(storeId: string, now = new Date()): Promise<Map<string, LastPurchase>> {
  const items = await prismadb.restockOrderItem.findMany({
    where: {
      quantityReceived: { gt: 0 },
      cost: { gt: 0 },
      restockOrder: { storeId, status: { in: RECEIVED_RESTOCK }, updatedAt: { gte: since(LAST_PURCHASE_WINDOW_DAYS, now) } },
    },
    select: { productId: true, cost: true, restockOrder: { select: { supplierId: true, updatedAt: true } } },
    orderBy: { restockOrder: { updatedAt: "desc" } },
  });
  const latest = new Map<string, LastPurchase>();
  for (const item of items) {
    if (!latest.has(item.productId)) {
      latest.set(item.productId, { cost: item.cost, supplierId: item.restockOrder.supplierId, at: item.restockOrder.updatedAt });
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
    getLastPurchaseByProduct(storeId, now),
  ]);
  return { sold30, sold90, onOrder, lastPurchase };
}
