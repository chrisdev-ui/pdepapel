import { OrderStatus, OrderType } from "@prisma/client";

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
  /** Teléfono normalizado; es el identificador de la página del cliente. */
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

type Draft = Omit<CustomerRecord, "segment" | "averageOrderValue" | "favoriteProducts" | "totalItems"> & {
  productCounts: Map<string, number>;
};

/**
 * Agrupa los pedidos con teléfono por cliente (teléfono normalizado) y calcula
 * su segmento. **Privada y sin guardia**: trae nombre, teléfono y correo, así
 * que nadie la llama sin pasar antes por `getCustomers` (dueña) o por
 * `getCustomerOverview` (agregado, también para solo lectura).
 */
async function buildCustomerRecords(storeId: string, now = new Date()): Promise<CustomerRecord[]> {
  const orders = await prismadb.order.findMany({
    where: { storeId, phone: { not: "" }, fullName: { not: "" } },
    select: {
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
      orderItems: { select: { quantity: true, product: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const drafts = new Map<string, Draft>();

  for (const order of orders) {
    const id = normalizePhone(order.phone);
    if (!id || isPlaceholderCustomer(order)) continue;
    const email = order.email?.trim() ? order.email.trim().toLowerCase() : null;
    const city = order.city?.trim() ? order.city.trim() : null;
    let draft = drafts.get(id);
    if (!draft) {
      // Los pedidos vienen del más reciente al más antiguo: el primero da el nombre vigente.
      draft = {
        id,
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
      drafts.set(id, draft);
    }
    if (!draft.email && email) draft.email = email;
    if (!draft.city && city) draft.city = city;

    draft.totalOrders += 1;
    if (order.createdAt < draft.firstOrderAt) draft.firstOrderAt = order.createdAt;
    if (order.createdAt > draft.lastOrderAt) draft.lastOrderAt = order.createdAt;

    const items = order.orderItems.map((item) => ({ name: item.product?.name ?? "Producto eliminado", quantity: item.quantity }));
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
      if (!draft.lastPaidAt || paidAt > draft.lastPaidAt) draft.lastPaidAt = paidAt;
      for (const item of items) {
        draft.productCounts.set(item.name, (draft.productCounts.get(item.name) ?? 0) + item.quantity);
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
      averageOrderValue: draft.paidOrders > 0 ? Math.ceil(draft.totalSpent / draft.paidOrders) : 0,
      totalItems: Array.from(productCounts.values()).reduce((sum, count) => sum + count, 0),
      favoriteProducts: Array.from(productCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      segment: getCustomerSegment(draft, vipThreshold, now),
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent || b.lastOrderAt.getTime() - a.lastOrderAt.getTime());
}

/**
 * La lista con nombre y teléfono es solo de la dueña. Una cuenta de solo
 * lectura no la ve: el identificador de cada fila **es** el teléfono
 * normalizado, y además va en la URL de `/clientes/[customerId]`, así que
 * esconder columnas no bastaría. Para esa cuenta está `getCustomerOverview`.
 */
export async function getCustomers(storeId: string, now = new Date()): Promise<CustomerRecord[]> {
  await requireStoreOwner(storeId);
  return buildCustomerRecords(storeId, now);
}

/** Ciudades con más clientes; la ciudad sola no identifica a nadie. */
export interface CustomerCityCount {
  city: string;
  customers: number;
}

export interface CustomerOverview {
  summary: CustomerSummary;
  cities: CustomerCityCount[];
}

/**
 * Lo único que ve una cuenta de solo lectura en Clientes: cuántos hay, cuántos
 * compran, cuántos son VIP o están inactivos, y de qué ciudades vienen. Sin
 * una sola fila con nombre, teléfono, correo ni cuánto gastó nadie.
 */
export async function getCustomerOverview(storeId: string, now = new Date()): Promise<CustomerOverview> {
  await requireStoreRead(storeId);
  const records = await buildCustomerRecords(storeId, now);

  const byCity = new Map<string, number>();
  for (const record of records) {
    const city = record.city?.trim();
    if (!city) continue;
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }

  return {
    summary: summarizeCustomers(records.map((record) => record.segment)),
    cities: Array.from(byCity.entries())
      .map(([city, customers]) => ({ city, customers }))
      .sort((a, b) => b.customers - a.customers || a.city.localeCompare(b.city, "es"))
      .slice(0, 12),
  };
}

/** Fila de la tabla: sin la lista completa de pedidos para no inflar la página. */
export type CustomerRow = Omit<CustomerRecord, "orders"> & { recentOrders: CustomerOrderSummary[] };

export function toCustomerRows(customers: CustomerRecord[]): CustomerRow[] {
  return customers.map(({ orders, ...customer }) => ({ ...customer, recentOrders: orders.slice(0, 5) }));
}

export async function getCustomerDetail(storeId: string, customerId: string) {
  await requireStoreOwner(storeId);
  const customers = await buildCustomerRecords(storeId);
  const customer = customers.find((item) => item.id === customerId) ?? null;
  if (!customer) return null;
  const reactivations = customer.email
    ? await prismadb.customerReactivation.findMany({
        where: { storeId, customerEmail: customer.email },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, status: true, sentAt: true, openedAt: true, clickedAt: true, couponUsed: true, createdAt: true },
      })
    : [];
  return { customer, reactivations };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>;
