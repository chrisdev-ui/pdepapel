import type { Prisma } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { createSettledMarketplaceSalesWhere } from "@/lib/mercadolibre/reporting";
import { DORMANT_WINDOW_DAYS, addKitDemand } from "@/lib/replenishment";
import { revenueOrderWhere } from "@/lib/revenue-orders";

/**
 * Ventas por producto y la regla de «producto lento», una sola para todo el
 * copiloto (kits para rotar, productos para promocionar). Cuenta pedidos
 * pagados de la tienda, el punto de venta y las ferias (`OrderItem`) y las
 * ventas liquidadas de Mercado Libre (`MarketplaceOrderItem`), por fecha de
 * pago. Lo que sale dentro de un kit cuenta como venta de sus piezas, igual
 * que en Inventario (`addKitDemand`). Los movimientos de inventario no
 * cuentan: cada venta ya está en un pedido y sumarlos la contaría dos veces.
 *
 * Recibe el cliente de Prisma: el panel le pasa el suyo y el copiloto el de
 * `copilot_ro` (solo pide columnas que ese usuario puede leer).
 */
export type SalesDb = Pick<Prisma.TransactionClient, "orderItem" | "marketplaceOrderItem" | "productKit">;

export const DEFAULT_SLOW_DAYS = DORMANT_WINDOW_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Más atrás que esto, «última venta» dice «hace más de un año». */
const LAST_SALE_LOOKBACK_DAYS = 365;

export interface ProductSales {
  /** Unidades en los últimos 30 días, propias más las que salieron dentro de kits. */
  sold30: number;
  /** Las 30 anteriores (de 60 a 30 días atrás). */
  previous30: number;
  /** En la ventana pedida (`days`). */
  soldInWindow: number;
  /** De `soldInWindow`, cuántas salieron dentro de kits. */
  soldInWindowViaKits: number;
  /** Última venta en el último año, propia o dentro de un kit; null si no hubo. */
  lastSaleAt: Date | null;
}

export interface SalesHistory {
  days: number;
  now: Date;
  get(productId: string): ProductSales;
  /** Productos de cada pedido pagado de los últimos `days` días (para «se compran juntos»). */
  ordersSince(days: number): string[][];
  /** Se llegó al tope de filas: las cifras pueden quedarse cortas. */
  truncated: boolean;
}

/** Una línea vendida: de un pedido (con su id) o de Mercado Libre. */
export interface SaleRow {
  orderId: string | null;
  productId: string;
  quantity: number;
  at: Date;
}

const since = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);
/** Filas por fuente: un año de una papelería cabe de sobra; si se llega, se avisa. */
export const SALES_ROW_CAP = 40000;

function paidOrder(storeId: string, from: Date, to: Date): Prisma.OrderWhereInput {
  return { storeId, ...revenueOrderWhere(), OR: [{ paidAt: { gte: from, lte: to } }, { paidAt: null, createdAt: { gte: from, lte: to } }] };
}

/** Las recetas de los kits de la tienda: pieza y cantidad por kit. */
export async function loadKitRecipes(db: SalesDb, storeId: string) {
  const rows = await db.productKit.findMany({ where: { kit: { storeId } }, select: { kitId: true, componentId: true, quantity: true } });
  const kits = new Map<string, { componentId: string; quantity: number }[]>();
  for (const row of rows) kits.set(row.kitId, [...(kits.get(row.kitId) ?? []), { componentId: row.componentId, quantity: row.quantity }]);
  return Array.from(kits, ([id, components]) => ({ id, components }));
}

/**
 * Dos lecturas (pedidos y Mercado Libre) de un año, o de la ventana si es más
 * larga, y el resto en memoria: el copiloto corre en una sola conexión con
 * tope de tiempo, así que pocas consultas pesan menos que muchas agrupaciones.
 */
export async function loadSalesHistory(db: SalesDb, storeId: string, options: { days?: number; now?: Date } = {}): Promise<SalesHistory> {
  const now = options.now ?? new Date();
  const days = options.days ?? DEFAULT_SLOW_DAYS;
  const from = since(now, Math.max(days, LAST_SALE_LOOKBACK_DAYS));
  const [shop, marketplace, kits] = await Promise.all([
    db.orderItem.findMany({
      where: { productId: { not: null }, order: paidOrder(storeId, from, now) },
      select: { orderId: true, productId: true, quantity: true, order: { select: { paidAt: true, createdAt: true } } },
      take: SALES_ROW_CAP,
    }),
    db.marketplaceOrderItem.findMany({
      where: { productId: { not: null }, marketplaceOrder: createSettledMarketplaceSalesWhere(storeId, { start: from, end: now }) },
      select: { productId: true, quantity: true, marketplaceOrder: { select: { paidAt: true, createdAt: true } } },
      take: SALES_ROW_CAP,
    }),
    loadKitRecipes(db, storeId),
  ]);
  const rows: SaleRow[] = [
    ...shop.flatMap((item) => (item.productId ? [{ orderId: item.orderId, productId: item.productId, quantity: item.quantity, at: item.order.paidAt ?? item.order.createdAt }] : [])),
    ...marketplace.flatMap((item) =>
      item.productId ? [{ orderId: null, productId: item.productId, quantity: item.quantity, at: item.marketplaceOrder.paidAt ?? item.marketplaceOrder.createdAt }] : [],
    ),
  ];
  return buildSalesHistory({ days, now, rows, kits, truncated: shop.length >= SALES_ROW_CAP || marketplace.length >= SALES_ROW_CAP });
}

/** La parte pura de `loadSalesHistory`: separada para probarla sin base. */
export function buildSalesHistory(input: {
  days: number;
  now: Date;
  rows: readonly SaleRow[];
  kits: { id: string; components: { componentId: string; quantity: number }[] }[];
  truncated?: boolean;
}): SalesHistory {
  const { days, now, rows, kits } = input;
  const unitsSince = (windowDays: number) => {
    const from = since(now, windowDays).getTime();
    const units = new Map<string, number>();
    for (const row of rows) if (row.at.getTime() >= from) units.set(row.productId, (units.get(row.productId) ?? 0) + row.quantity);
    return units;
  };
  const d30 = addKitDemand(unitsSince(30), kits);
  const d60 = addKitDemand(unitsSince(60), kits);
  const dWindow = addKitDemand(unitsSince(days), kits);
  const latest = new Map<string, Date>();
  for (const row of rows) {
    const own = latest.get(row.productId);
    if (!own || row.at > own) latest.set(row.productId, row.at);
  }
  for (const kit of kits) {
    const at = latest.get(kit.id);
    if (!at) continue;
    for (const component of kit.components) {
      const own = latest.get(component.componentId);
      if (!own || at > own) latest.set(component.componentId, at);
    }
  }
  return {
    days,
    now,
    truncated: input.truncated ?? false,
    get: (productId) => {
      const sold30 = d30.total.get(productId) ?? 0;
      return {
        sold30,
        previous30: Math.max(0, (d60.total.get(productId) ?? 0) - sold30),
        soldInWindow: dWindow.total.get(productId) ?? 0,
        soldInWindowViaKits: dWindow.viaKits.get(productId) ?? 0,
        lastSaleAt: latest.get(productId) ?? null,
      };
    },
    ordersSince: (windowDays) => {
      const from = since(now, windowDays).getTime();
      const orders = new Map<string, string[]>();
      for (const row of rows) if (row.orderId && row.at.getTime() >= from) orders.set(row.orderId, [...(orders.get(row.orderId) ?? []), row.productId]);
      return Array.from(orders.values());
    },
  };
}

export interface SlowMoverCandidate {
  id: string;
  name: string;
  stock: number;
  reservedUnits: number;
  isKit: boolean;
  isArchived: boolean;
  /** Costo por unidad (compra + transporte); null si no está cargado. */
  unitCost: number | null;
}

export interface SlowMover {
  id: string;
  name: string;
  available: number;
  unitCost: number | null;
  /** Plata quieta a costo: disponible × costo; null si falta el costo. */
  tiedUpAtCost: number | null;
  lastSaleAt: Date | null;
  /** Días desde la última venta; null si no se vendió en el último año. */
  daysSinceLastSale: number | null;
}

/**
 * Lento: se puede vender (disponible > 0), no es kit, no está archivado y no
 * se vendió en la ventana, ni suelto ni dentro de un kit. Es la misma regla
 * que la tarjeta «Sin movimiento» de Inventario (sin mirar la fecha de
 * creación). Ordenado por plata quieta a costo; los que no tienen
 * costo van al final.
 */
export function isSlowMover(product: SlowMoverCandidate, sales: ProductSales): boolean {
  if (product.isKit || product.isArchived) return false;
  if (availableStock(product) <= 0) return false;
  return sales.soldInWindow <= 0;
}

export function rankSlowMovers(products: readonly SlowMoverCandidate[], history: SalesHistory): SlowMover[] {
  const rows = products
    .filter((product) => isSlowMover(product, history.get(product.id)))
    .map((product) => {
      const available = availableStock(product);
      const lastSaleAt = history.get(product.id).lastSaleAt;
      return {
        id: product.id,
        name: product.name,
        available,
        unitCost: product.unitCost,
        tiedUpAtCost: product.unitCost === null ? null : Math.round(available * product.unitCost),
        lastSaleAt,
        daysSinceLastSale: lastSaleAt ? Math.floor((history.now.getTime() - lastSaleAt.getTime()) / DAY_MS) : null,
      };
    });
  return rows.sort((a, b) => (b.tiedUpAtCost ?? -1) - (a.tiedUpAtCost ?? -1) || b.available - a.available || a.name.localeCompare(b.name));
}

/** El mismo costo que muestra `detalleProducto`: compra más transporte. */
export const unitCostOf = (product: { acqPrice: number | null; transportationCost: number | null }) =>
  product.acqPrice === null ? null : product.acqPrice + (product.transportationCost ?? 0);
