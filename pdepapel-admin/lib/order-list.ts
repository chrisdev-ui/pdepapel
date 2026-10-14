import { OrderType, type Prisma } from "@prisma/client";

import {
  DEFAULT_ORDER_VIEW,
  ORDER_VIEWS,
  getOrderQueue,
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

export interface OrderListQuery {
  view: OrderView;
  filters: OrderListFilters;
  search: string;
  page: number;
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
  return {
    view: isOrderView(view) ? view : DEFAULT_ORDER_VIEW,
    filters: parseOrderListFilters(query),
    search: (query.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    page: Number.isFinite(page) && page > 0 ? page : 1,
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

/** Canal, fecha y búsqueda van en la consulta; las pestañas se resuelven con las reglas de las colas. */
export function orderListWhere(storeId: string, filters: OrderListFilters, search: string, now = new Date()): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { storeId };
  if (filters.channel) where.type = { in: CHANNEL_TYPES[filters.channel] };
  const range = getOrderDateRange(filters.date, now);
  if (range) where.createdAt = { gte: range.start, lte: range.end };
  const words = search.split(/\s+/).filter(Boolean).slice(0, 5);
  if (words.length) {
    where.AND = words.map((word) => ({
      OR: [
        { orderNumber: { contains: word } },
        { fullName: { contains: word } },
        { phone: { contains: word } },
        { documentId: { contains: word } },
        { orderItems: { some: { name: { contains: word } } } },
        { orderItems: { some: { product: { name: { contains: word } } } } },
      ],
    }));
  }
  return where;
}

/** Lo justo para decidir la cola de cada pedido. */
export const ORDER_QUEUE_SELECT = {
  id: true,
  status: true,
  type: true,
  createdAt: true,
  paidAt: true,
  expiresAt: true,
  payment: { select: { method: true } },
  shipping: { select: { status: true, trackingCode: true, updatedAt: true } },
  _count: { select: { inventoryIssues: { where: { resolvedAt: null } } } },
} satisfies Prisma.OrderSelect;

type QueueRow = Prisma.OrderGetPayload<{ select: typeof ORDER_QUEUE_SELECT }>;

export interface OrderListPage {
  ids: string[];
  counts: Record<OrderView, number>;
  /** Pedidos de la pestaña actual con los filtros puestos. */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

/** La parte pura: clasificar, contar y cortar la página. Las filas vienen ordenadas de la más nueva a la más vieja. */
export function paginateOrders(rows: readonly QueueRow[], query: OrderListQuery, now = new Date(), pageSize = ORDER_PAGE_SIZE): OrderListPage {
  const counts = Object.fromEntries(ORDER_VIEWS.map((view) => [view.id, 0])) as Record<OrderView, number>;
  const matching: string[] = [];
  for (const row of rows) {
    const order: QueueableOrder = { ...row, openInventoryIssues: row._count.inventoryIssues };
    const queue = getOrderQueue(order, now);
    for (const { id } of ORDER_VIEWS) if (orderMatchesView(queue, id, order, now)) counts[id] += 1;
    if (orderMatchesView(queue, query.view, order, now)) matching.push(row.id);
  }
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return { ids: matching.slice((page - 1) * pageSize, page * pageSize), counts, total: matching.length, page, pageCount, pageSize };
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
