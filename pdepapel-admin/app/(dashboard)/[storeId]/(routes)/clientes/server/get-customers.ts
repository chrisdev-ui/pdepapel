import { OrderStatus, OrderType, Prisma } from "@prisma/client";

import { customerIdFromPhone, isCustomerId } from "@/lib/customer-identity";
import {
  computeVipThreshold,
  getCustomerSegment,
  isPlaceholderCustomer,
  normalizePhone,
  summarizeCustomers,
  type CustomerSegment,
  type CustomerSummary,
} from "@/lib/customer-views";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner, requireStoreRead } from "@/lib/store-access";

const PAID: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SENT];
const PENDING: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CREATED];

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: OrderType;
  total: number;
  createdAt: Date;
  paidAt: Date | null;
  items: { name: string; quantity: number }[];
}

export interface CustomerRecord {
  /** Huella del teléfono normalizado; es el identificador de la página del cliente. */
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string | null;
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  totalItems: number;
  firstOrderAt: Date;
  lastOrderAt: Date;
  lastPaidAt: Date | null;
  favoriteProducts: { name: string; count: number }[];
  orders: CustomerOrderSummary[];
  segment: CustomerSegment;
}

type Draft = Omit<
  CustomerRecord,
  "segment" | "averageOrderValue" | "favoriteProducts" | "totalItems"
> & {
  productCounts: Map<string, number>;
};

/**
 * Cuánto se trae de cada pedido.
 *
 * - `completo`: con las líneas y el nombre de cada producto. Solo lo necesita
 *   la lista de la dueña, que muestra «lo que más compra» y las unidades.
 * - `agregado`: sin líneas. Es lo único que hace falta para los segmentos, las
 *   ciudades y los totales en dinero, que es todo lo que ve una cuenta de solo
 *   lectura. Se ahorra el cruce con `OrderItem` y `Product`, que era la parte
 *   cara de la consulta.
 */
type Depth = "completo" | "agregado";

/**
 * Tope de pedidos que se agrupan de una vez.
 *
 * Es la misma idea del kardex (`MOVEMENTS_ALL_TAKE`): la consulta no puede
 * crecer sin final. Aquí **no** se usa una ventana por fechas, y a propósito:
 * un cliente se mide por lo que ha gastado desde siempre, así que recortar por
 * fecha cambiaría en silencio «cuánto ha comprado» y quién es VIP. Un tope
 * sobre los pedidos más recientes no cambia nada mientras no se alcance, y
 * cuando se alcance la pantalla lo dice en vez de callárselo.
 */
export const CUSTOMERS_ORDER_TAKE = 5000;

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  phone: true,
  fullName: true,
  email: true,
  city: true,
  status: true,
  type: true,
  total: true,
  createdAt: true,
  paidAt: true,
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }> & {
  orderItems?: { quantity: number; product: { name: string } | null }[];
};

/** Un pedido cuenta como cliente solo si trae con qué identificar a la persona. */
const orderFilter = (storeId: string): Prisma.OrderWhereInput => ({
  storeId,
  phone: { not: "" },
  fullName: { not: "" },
});

async function loadOrders(storeId: string, depth: Depth): Promise<OrderRow[]> {
  return prismadb.order.findMany({
    where: orderFilter(storeId),
    select:
      depth === "completo"
        ? {
            ...ORDER_SELECT,
            orderItems: {
              select: { quantity: true, product: { select: { name: true } } },
            },
          }
        : ORDER_SELECT,
    orderBy: { createdAt: "desc" },
    take: CUSTOMERS_ORDER_TAKE,
  });
}

/**
 * Agrupa los pedidos con teléfono por cliente (teléfono normalizado) y calcula
 * su segmento. **Privada y sin guardia**: trae nombre, teléfono y correo, así
 * que nadie la llama sin pasar antes por `getCustomers` (dueña),
 * `getCustomerOverview` (agregado, también para solo lectura) o
 * `getCustomerDetail` (dueña).
 */
function groupOrders(
  storeId: string,
  orders: OrderRow[],
  now: Date,
): CustomerRecord[] {
  const drafts = new Map<string, Draft>();

  for (const order of orders) {
    const phone = normalizePhone(order.phone);
    if (!phone || isPlaceholderCustomer(order)) continue;
    const email = order.email?.trim() ? order.email.trim().toLowerCase() : null;
    const city = order.city?.trim() ? order.city.trim() : null;
    let draft = drafts.get(phone);
    if (!draft) {
      // Los pedidos vienen del más reciente al más antiguo: el primero da el nombre vigente.
      draft = {
        id: customerIdFromPhone(storeId, phone),
        fullName: order.fullName,
        phone: order.phone,
        email,
        city,
        totalOrders: 0,
        paidOrders: 0,
        pendingOrders: 0,
        cancelledOrders: 0,
        totalSpent: 0,
        firstOrderAt: order.createdAt,
        lastOrderAt: order.createdAt,
        lastPaidAt: null,
        orders: [],
        productCounts: new Map(),
      };
      drafts.set(phone, draft);
    }
    if (!draft.email && email) draft.email = email;
    if (!draft.city && city) draft.city = city;

    draft.totalOrders += 1;
    if (order.createdAt < draft.firstOrderAt)
      draft.firstOrderAt = order.createdAt;
    if (order.createdAt > draft.lastOrderAt)
      draft.lastOrderAt = order.createdAt;

    const items = (order.orderItems ?? []).map((item) => ({
      name: item.product?.name ?? "Producto eliminado",
      quantity: item.quantity,
    }));
    draft.orders.push({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      type: order.type,
      total: Number(order.total),
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      items,
    });

    if (PAID.includes(order.status)) {
      draft.paidOrders += 1;
      draft.totalSpent += Number(order.total);
      const paidAt = order.paidAt ?? order.createdAt;
      if (!draft.lastPaidAt || paidAt > draft.lastPaidAt)
        draft.lastPaidAt = paidAt;
      for (const item of items) {
        draft.productCounts.set(
          item.name,
          (draft.productCounts.get(item.name) ?? 0) + item.quantity,
        );
      }
    } else if (PENDING.includes(order.status)) {
      draft.pendingOrders += 1;
    } else if (order.status === OrderStatus.CANCELLED) {
      draft.cancelledOrders += 1;
    }
  }

  const list = Array.from(drafts.values());
  const vipThreshold = computeVipThreshold(list, now);

  return list
    .map(({ productCounts, ...draft }) => ({
      ...draft,
      averageOrderValue:
        draft.paidOrders > 0
          ? Math.ceil(draft.totalSpent / draft.paidOrders)
          : 0,
      ...summarizeProducts(productCounts),
      segment: getCustomerSegment(draft, vipThreshold, now),
    }))
    .sort(
      (a, b) =>
        b.totalSpent - a.totalSpent ||
        b.lastOrderAt.getTime() - a.lastOrderAt.getTime(),
    );
}

function summarizeProducts(counts: Map<string, number>) {
  return {
    totalItems: Array.from(counts.values()).reduce(
      (sum, count) => sum + count,
      0,
    ),
    favoriteProducts: Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  };
}

/**
 * Memoria corta, con marca de agua.
 *
 * La agrupación recorre todos los pedidos de la tienda, y antes eso pasaba en
 * cada visita. Guardarla en memoria sería arriesgado —una venta recién hecha
 * tiene que verse—, así que antes de reutilizarla se pregunta por una marca de
 * agua barata: cuántos pedidos hay y cuál es el más recientemente modificado.
 * Si algo se creó, se editó o se borró, la marca cambia y se vuelve a construir.
 *
 * Lo que la marca no ve es un cambio en las **líneas** de un pedido o el nombre
 * de un producto, porque eso no toca `Order.updatedAt`. Para eso está el minuto
 * de vigencia: como mucho, «lo que más compra» se queda un minuto con el nombre
 * viejo.
 */
const MEMO_TTL_MS = 60_000;
const MEMO_MAX_ENTRIES = 8;

/** Lo que devuelven todas las cargas: los clientes y si el tope mordió. */
export interface CustomerRecords {
  records: CustomerRecord[];
  /** `true` si se alcanzó `CUSTOMERS_ORDER_TAKE`: hay pedidos fuera de estas cifras. */
  truncated: boolean;
}

interface Memo extends CustomerRecords {
  watermark: string;
  at: number;
}

const memos = new Map<string, Memo>();

async function ordersWatermark(storeId: string): Promise<string> {
  const { _count, _max } = await prismadb.order.aggregate({
    where: orderFilter(storeId),
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return `${_count._all}:${_max.updatedAt?.getTime() ?? 0}`;
}

function freshMemo(key: string, watermark: string): CustomerRecords | null {
  const hit = memos.get(key);
  if (!hit || hit.watermark !== watermark) return null;
  if (Date.now() - hit.at >= MEMO_TTL_MS) return null;
  return { records: hit.records, truncated: hit.truncated };
}

async function customerRecords(
  storeId: string,
  depth: Depth,
  now?: Date,
): Promise<CustomerRecords> {
  // Con un `now` explícito (pruebas) no se memoriza: los segmentos dependen de él.
  if (now) {
    const orders = await loadOrders(storeId, depth);
    return {
      records: groupOrders(storeId, orders, now),
      truncated: orders.length >= CUSTOMERS_ORDER_TAKE,
    };
  }

  const watermark = await ordersWatermark(storeId);
  // Lo completo sirve también para quien pidió el agregado; al revés no.
  const reusable =
    depth === "agregado" ? ["completo", "agregado"] : ["completo"];
  for (const candidate of reusable) {
    const hit = freshMemo(`${storeId}:${candidate}`, watermark);
    if (hit) return hit;
  }

  const orders = await loadOrders(storeId, depth);
  const built: CustomerRecords = {
    records: groupOrders(storeId, orders, new Date()),
    truncated: orders.length >= CUSTOMERS_ORDER_TAKE,
  };
  if (memos.size >= MEMO_MAX_ENTRIES) memos.clear();
  memos.set(`${storeId}:${depth}`, { ...built, watermark, at: Date.now() });
  return built;
}

/** Solo para las pruebas: la memoria corta no debe cruzarse entre casos. */
export function __resetCustomerMemo() {
  memos.clear();
}

/**
 * La lista con nombre y teléfono es solo de la dueña. Una cuenta de solo
 * lectura no la ve: cada fila trae el teléfono y el correo de una persona, así
 * que esconder columnas no bastaría. Para esa cuenta está `getCustomerOverview`.
 */
export async function getCustomers(
  storeId: string,
  now?: Date,
): Promise<CustomerRecords> {
  await requireStoreOwner(storeId);
  return customerRecords(storeId, "completo", now);
}

/** Ciudades con más clientes; la ciudad sola no identifica a nadie. */
export interface CustomerCityCount {
  city: string;
  customers: number;
}

export interface CustomerOverview {
  summary: CustomerSummary;
  cities: CustomerCityCount[];
  truncated: boolean;
}

/**
 * Lo único que ve una cuenta de solo lectura en Clientes: cuántos hay, cuántos
 * compran, cuántos son VIP o están inactivos, y de qué ciudades vienen. Sin una
 * sola fila con nombre, teléfono, correo ni cuánto gastó nadie. Para estos
 * cuatro números y una lista de ciudades no hacen falta las líneas de los
 * pedidos, así que no se piden.
 */
export async function getCustomerOverview(
  storeId: string,
  now?: Date,
): Promise<CustomerOverview> {
  await requireStoreRead(storeId);
  const { records, truncated } = await customerRecords(
    storeId,
    "agregado",
    now,
  );

  const byCity = new Map<string, number>();
  for (const record of records) {
    const city = record.city?.trim();
    if (!city) continue;
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }

  return {
    truncated,
    summary: summarizeCustomers(records.map((record) => record.segment)),
    cities: Array.from(byCity.entries())
      .map(([city, customers]) => ({ city, customers }))
      .sort(
        (a, b) =>
          b.customers - a.customers || a.city.localeCompare(b.city, "es"),
      )
      .slice(0, 12),
  };
}

/** Fila de la tabla: sin la lista completa de pedidos para no inflar la página. */
export type CustomerRow = Omit<CustomerRecord, "orders"> & {
  recentOrders: CustomerOrderSummary[];
};

export function toCustomerRows(customers: CustomerRecord[]): CustomerRow[] {
  return customers.map(({ orders, ...customer }) => ({
    ...customer,
    recentOrders: orders.slice(0, 5),
  }));
}

/**
 * Las líneas de **una** persona, pedidas por id de pedido. La ficha necesita el
 * detalle de cada compra, pero no hay por qué traer las de las otras 400.
 */
async function withOrderItems(record: CustomerRecord): Promise<CustomerRecord> {
  const orderIds = record.orders.map((order) => order.id);
  if (orderIds.length === 0) return record;

  const rows = await prismadb.orderItem.findMany({
    where: { orderId: { in: orderIds } },
    select: {
      orderId: true,
      quantity: true,
      product: { select: { name: true } },
    },
  });

  const byOrder = new Map<string, { name: string; quantity: number }[]>();
  for (const row of rows) {
    const list = byOrder.get(row.orderId) ?? [];
    list.push({
      name: row.product?.name ?? "Producto eliminado",
      quantity: row.quantity,
    });
    byOrder.set(row.orderId, list);
  }

  const counts = new Map<string, number>();
  const orders = record.orders.map((order) => {
    const items = byOrder.get(order.id) ?? [];
    if (PAID.includes(order.status)) {
      for (const item of items)
        counts.set(item.name, (counts.get(item.name) ?? 0) + item.quantity);
    }
    return { ...order, items };
  });

  return { ...record, orders, ...summarizeProducts(counts) };
}

export async function getCustomerDetail(storeId: string, customerId: string) {
  await requireStoreOwner(storeId);
  if (!isCustomerId(customerId)) return null;

  const { records } = await customerRecords(storeId, "agregado");
  const base = records.find((item) => item.id === customerId) ?? null;
  if (!base) return null;

  const customer = await withOrderItems(base);
  const reactivations = customer.email
    ? await prismadb.customerReactivation.findMany({
        where: { storeId, customerEmail: customer.email },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          sentAt: true,
          openedAt: true,
          clickedAt: true,
          couponUsed: true,
          createdAt: true,
        },
      })
    : [];
  return { customer, reactivations };
}

export type CustomerDetail = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetail>>
>;
