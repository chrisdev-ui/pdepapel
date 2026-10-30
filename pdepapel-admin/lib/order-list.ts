import { OrderStatus, OrderType, ShippingStatus, type Prisma } from "@prisma/client";
import { UNFULFILLED_PRESALE_LINE, UNRELEASED_PRESALE_LINE } from "@/lib/presale-hold";

import {
  DEFAULT_ORDER_VIEW,
  ORDER_VIEWS,
  getOrderChannel,
  getOrderQueue,
  getPaymentBadge,
  getShippingBadge,
  isOrderView,
  orderMatchesView,
  type OrderView,
  type QueueableOrder,
  type SalesChannel,
} from "@/lib/order-queues";
import { getOrderDateRange, parseOrderListFilters, type OrderListFilters } from "@/lib/order-list-filters";

/**
 * La lista de Pedidos, paginada en el servidor. Las pestañas (colas) dependen
 * de reglas con tiempo («pagado hace más de 30 días», «sin novedad en 5
 * días», «pago en línea de más de 2 horas»): en vez de repetirlas en SQL, se
 * lee una fila liviana por pedido con solo los campos de esas reglas, se
 * clasifica con las mismas funciones de `order-queues` y de ahí salen los
 * conteos de todas las pestañas y los ids de la página. Después solo esas
 * filas se cargan completas.
 */
export const ORDER_PAGE_SIZE = 25;
const MAX_SEARCH_LENGTH = 80;

export const ORDER_SORT_COLUMNS = ["orderNumber", "fullName", "channel", "payment", "shipping", "totalPrice"] as const;
export type OrderSortColumn = (typeof ORDER_SORT_COLUMNS)[number];

export interface OrderListQuery {
  view: OrderView;
  filters: OrderListFilters;
  search: string;
  page: number;
  /** Orden de toda la lista (`orden=total` o `orden=-total`); sin él, del más nuevo al más viejo. */
  sort: { id: OrderSortColumn; desc: boolean } | null;
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export function parseOrderListQuery(params: SearchParams): OrderListQuery {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = first(value);
    if (single !== null) query.set(key, single);
  }
  const view = query.get("vista");
  const page = Number.parseInt(query.get("pagina") ?? "1", 10);
  const sortParam = query.get("orden") ?? "";
  const desc = sortParam.startsWith("-");
  const sortId = (desc ? sortParam.slice(1) : sortParam) as OrderSortColumn;
  return {
    view: isOrderView(view) ? view : DEFAULT_ORDER_VIEW,
    filters: parseOrderListFilters(query),
    search: (query.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    sort: ORDER_SORT_COLUMNS.includes(sortId) ? { id: sortId, desc } : null,
  };
}

const CHANNEL_TYPES: Record<SalesChannel, OrderType[]> = {
  tienda: [OrderType.STANDARD],
  presencial: [OrderType.POINT_OF_SALE],
  feria: [OrderType.FESTIVAL],
  cotizacion: [OrderType.QUOTATION],
  personalizado: [OrderType.CUSTOM],
  regalo: [OrderType.GIFT_CARD],
};

/** «45000», «45.000» o «$45.000» (el «$» se quita antes) como monto entero; si no, null. */
export function parseAmount(word: string): number | null {
  if (!/^(\d{1,3}(\.\d{3})+|\d+)$/.test(word)) return null;
  const value = Number(word.replace(/\./g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

/** Canal, fecha y búsqueda van en la consulta; las pestañas se resuelven con las reglas de las colas. */
export function orderListWhere(storeId: string, filters: OrderListFilters, search: string, now = new Date()): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { storeId };
  if (filters.channel) where.type = { in: CHANNEL_TYPES[filters.channel] };
  const range = getOrderDateRange(filters.date, now);
  if (range) where.createdAt = { gte: range.start, lte: range.end };
  const words = search.replace(/\$\s*/g, "").split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length) {
    where.AND = words.map((word) => {
      const amount = parseAmount(word);
      return {
        OR: [
          ...(amount !== null ? [{ total: amount }, { orderNumber: { contains: String(amount) } }] : []),
          { orderNumber: { contains: word } },
          { fullName: { contains: word } },
          { phone: { contains: word } },
          { documentId: { contains: word } },
          { orderItems: { some: { name: { contains: word } } } },
          { orderItems: { some: { product: { name: { contains: word } } } } },
        ],
      };
    });
  }
  return where;
}

/** Lo justo para decidir la cola de cada pedido. */
export const ORDER_QUEUE_SELECT = {
  id: true,
  orderNumber: true,
  fullName: true,
  total: true,
  status: true,
  type: true,
  createdAt: true,
  paidAt: true,
  expiresAt: true,
  payment: { select: { method: true } },
  shipping: { select: { status: true, provider: true, trackingCode: true, updatedAt: true } },
  _count: { select: { inventoryIssues: { where: { resolvedAt: null } }, orderItems: { where: UNRELEASED_PRESALE_LINE } } },
  orderItems: { where: UNFULFILLED_PRESALE_LINE, select: { id: true }, take: 1 },
} satisfies Prisma.OrderSelect;

type QueueRow = Prisma.OrderGetPayload<{ select: typeof ORDER_QUEUE_SELECT }>;

function queueableRow(row: QueueRow): QueueableOrder {
  return {
    ...row,
    openInventoryIssues: row._count.inventoryIssues,
    heldByPresale: row._count.orderItems > 0,
    unfulfilledPresale: row.orderItems.length > 0,
  };
}

export interface OrderListPage {
  ids: string[];
  counts: Record<OrderView, number>;
  /** Pedidos de la pestaña actual con los filtros puestos. */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const compareSortKeys = (a: string | number, b: string | number) => (typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b)));

/** Lo mismo que muestra cada columna ordenable de la tabla. */
const ORDER_SORT_KEYS: Record<OrderSortColumn, (row: QueueRow, order: QueueableOrder, now: Date) => string | number> = {
  orderNumber: (row) => row.orderNumber,
  fullName: (row) => row.fullName ?? "",
  channel: (row) => getOrderChannel(row.type).label,
  payment: (_row, order, now) => getPaymentBadge(order, now).label,
  shipping: (_row, order, now) => getShippingBadge(order, now)?.label ?? "",
  totalPrice: (row) => row.total,
};

/** La parte pura: clasificar, contar y cortar la página. Las filas vienen ordenadas de la más nueva a la más vieja. */
export function paginateOrders(rows: readonly QueueRow[], query: OrderListQuery, now = new Date(), pageSize = ORDER_PAGE_SIZE): OrderListPage {
  const counts = Object.fromEntries(ORDER_VIEWS.map((view) => [view.id, 0])) as Record<OrderView, number>;
  const matching: { row: QueueRow; order: QueueableOrder }[] = [];
  for (const row of rows) {
    const order: QueueableOrder = queueableRow(row);
    const queue = getOrderQueue(order, now);
    for (const { id } of ORDER_VIEWS) if (orderMatchesView(queue, id, order, now)) counts[id] += 1;
    if (orderMatchesView(queue, query.view, order, now)) matching.push({ row, order });
  }
  if (query.sort) {
    const { id, desc } = query.sort;
    const key = ORDER_SORT_KEYS[id];
    // `sort` es estable: entre iguales queda el más nuevo primero.
    matching.sort((a, b) => (desc ? -1 : 1) * compareSortKeys(key(a.row, a.order, now), key(b.row, b.order, now)));
  }
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return { ids: matching.slice((page - 1) * pageSize, page * pageSize).map(({ row }) => row.id), counts, total: matching.length, page, pageCount, pageSize };
}

type OrderListDb = { order: { findMany: (args: { where: Prisma.OrderWhereInput; select: typeof ORDER_QUEUE_SELECT; orderBy: Prisma.OrderOrderByWithRelationInput[] }) => Promise<QueueRow[]> } };

export async function listOrderPage(db: OrderListDb, storeId: string, query: OrderListQuery, now = new Date()): Promise<OrderListPage> {
  const rows = await db.order.findMany({
    where: orderListWhere(storeId, query.filters, query.search, now),
    select: ORDER_QUEUE_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return paginateOrders(rows, query, now);
}

/**
 * Cuántos pedidos hay «Por atender», para el número de «Pedidos» en el menú.
 * Misma regla que la pestaña (`orderMatchesView`), sobre los únicos pedidos
 * que pueden caer ahí: los cancelados, las ventas presenciales, de feria y de
 * tarjeta de regalo y los ya entregados nunca están «Por atender», así que no
 * se cargan. Antes el menú contaba los pedidos PENDING, que no es lo mismo.
 */
export async function countOrdersToAttend(db: OrderListDb, storeId: string, now = new Date()): Promise<number> {
  const rows = await db.order.findMany({
    where: {
      storeId,
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REJECTED] },
      type: { notIn: [OrderType.POINT_OF_SALE, OrderType.FESTIVAL, OrderType.GIFT_CARD] },
      OR: [{ shipping: null }, { shipping: { status: { not: ShippingStatus.Delivered } } }],
    },
    select: ORDER_QUEUE_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.filter((row) => {
    const order: QueueableOrder = queueableRow(row);
    return orderMatchesView(getOrderQueue(order, now), "por-atender", order, now);
  }).length;
}
