import { CAPSULAS_SORPRESA_ID } from "@/constants";
import { compareUrgency, computeReplenishment, describeCover } from "@/lib/replenishment";
import { getUnitsOnOrderByProduct, getUnitsSoldByProduct } from "@/lib/replenishment-db";
import { createSettledMarketplaceSalesWhere } from "@/lib/mercadolibre/reporting";
import { AWAITING_PAYMENT_STALE_HOURS, AWAITING_PAYMENT_WINDOW_DAYS, STALE_IN_TRANSIT_DAYS } from "@/lib/order-queues";
import prismadb from "@/lib/prismadb";
import { hasStoreLowStockThreshold, resolveLowStockThreshold } from "@/lib/product-readiness";
import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";
import { addDays, startOfDay, subDays, subHours } from "date-fns";
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";

const TZ = "America/Bogota";
/** Ventana de trabajo para “por despachar” y “pagos por verificar”: lo viejo es ruido, no pendiente. */
export const DISPATCH_WINDOW_DAYS = 30;
export const TRANSFER_WINDOW_DAYS = 14;

/**
 * Pedidos pagados en un rango. Los pedidos marcados a mano antes de que
 * existiera `paidAt` no tienen fecha de pago: para ellos vale la de creación.
 */
export function paidWithin(start: Date, end: Date) {
  return {
    OR: [
      { paidAt: { gte: start, lte: end } },
      { paidAt: null, createdAt: { gte: start, lte: end } },
    ],
  };
}
const PAID_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SENT];
const SHIPPABLE_TYPES: OrderType[] = [OrderType.STANDARD, OrderType.CUSTOM, OrderType.QUOTATION];
const ONLINE_METHODS: PaymentMethod[] = [PaymentMethod.Bold, PaymentMethod.Wompi, PaymentMethod.PayU];

export type SalesChannel = "tienda" | "presencial" | "feria" | "mercadolibre";

export interface TodayPendingAction {
  kind: "inventory-issue" | "shipping-issue" | "verify-payment" | "awaiting-payment" | "create-guide" | "answer-question" | "restock" | "expiring-quote" | "broken-image";
  title: string;
  meta: string;
  href: string;
  action: string;
  /** Orden de urgencia: menor va primero. */
  weight: number;
}

export interface TodaySummary {
  generatedAt: Date;
  today: { net: number; orders: number; marketplaceNet: number };
  toDispatch: number;
  pendingPayments: { count: number; amount: number };
  lowStock: {
    /** Productos «Por reponer» (misma regla que Inventario: cobertura por ventas, umbral como respaldo). */
    count: number;
    outOfStock: number;
    /** Se venden y se acaban en menos de una semana (o ya se acabaron). */
    runsOutThisWeek: number;
    /** Agotados que vendieron en los últimos 90 días. */
    outOfStockSelling: number;
    /** Umbral de respaldo (`resolveLowStockThreshold`). */
    threshold: number;
    /** Si el umbral viene de Ajustes de la tienda. */
    thresholdFromSettings: boolean;
  };
  pending: TodayPendingAction[];
  week: {
    net: number;
    orders: number;
    previousNet: number;
    /** Variación frente a los 7 días anteriores, en porcentaje entero; null si no hay base. */
    change: number | null;
    days: { label: string; date: string; net: number }[];
    channels: { channel: SalesChannel; label: string; net: number }[];
  };
  topProducts: { productId: string | null; name: string; units: number }[];
}

export function channelForOrderType(type: OrderType): SalesChannel {
  if (type === OrderType.POINT_OF_SALE) return "presencial";
  if (type === OrderType.FESTIVAL) return "feria";
  return "tienda";
}

/** Inicio y fin (UTC) del día actual en Colombia. */
export function getColombiaDayBounds(now = new Date()) {
  const local = utcToZonedTime(now, TZ);
  const start = zonedTimeToUtc(startOfDay(local), TZ);
  const end = new Date(zonedTimeToUtc(startOfDay(addDays(local, 1)), TZ).getTime() - 1);
  return { start, end, local };
}

const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

const isoDay = (date: Date) => {
  const local = utcToZonedTime(date, TZ);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
};

export interface TodayRawInput {
  now: Date;
  todayOrders: { total: number }[];
  todayMarketplaceNet: number;
  pendingTransfers: { id: string; orderNumber: string; fullName: string; total: number; createdAt: Date; method: PaymentMethod | null }[];
  /** Pagos en línea (Bold/Wompi) que llevan más de dos horas sin completarse. */
  awaitingPayments?: { id: string; orderNumber: string; fullName: string; total: number; createdAt: Date; method: PaymentMethod | null }[];
  toDispatch: { id: string; orderNumber: string; fullName: string; city: string | null; paidAt: Date | null; courier: string | null }[];
  toDispatchCount: number;
  lowStockProducts: { id: string; name: string; stock: number; coverLabel?: string }[];
  lowStockCount: number;
  outOfStockCount: number;
  lowStockRunsOutThisWeek?: number;
  lowStockOutOfStockSelling?: number;
  /** Umbral aplicado a los conteos; si falta se asume el valor por defecto. */
  lowStockThreshold?: number;
  lowStockThresholdFromSettings?: boolean;
  /** Productos activos con alguna imagen que ya no existe en Cloudinary. */
  brokenImageProducts?: number;
  /** Líneas de inventario que fallaron al mover y siguen abiertas; `orphans` son las de pedidos ya borrados. */
  inventoryIssues?: { open: number; orphans: number };
  /** Envíos con novedad de la transportadora o en tránsito sin cambios en más de STALE_IN_TRANSIT_DAYS. */
  shippingIssues?: { count: number; sample: { orderNumber: string; fullName: string; status: ShippingStatus; stale: boolean }[] };
  unansweredQuestions: { id: string; question: string; productName: string | null; askedAt: Date | null }[];
  unansweredCount: number;
  expiringQuotes: { id: string; orderNumber: string; fullName: string; total: number; expiresAt: Date | null }[];
  weekOrders: { total: number; paidAt: Date | null; createdAt: Date; type: OrderType }[];
  previousWeekOrders: { total: number }[];
  weekMarketplace: { netAmount: number | null; paidAt: Date | null; createdAt: Date }[];
  previousWeekMarketplaceNet: number;
  weekItems: { productId: string | null; name: string; quantity: number }[];
}

const SHIPPING_ISSUE_LABEL: Partial<Record<ShippingStatus, string>> = {
  FailedDelivery: "entrega fallida",
  Returned: "devuelto",
  Exception: "incidencia",
};

const relative = (date: Date | null | undefined, now: Date) => {
  if (!date) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
};

const cop = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    .format(value)
    .replace(/ /g, " ");

/** Construye el resumen del día a partir de filas ya cargadas (puro, testeable). */
export function buildTodaySummary(input: TodayRawInput, storeId: string): TodaySummary {
  const { now } = input;
  const todayNet = input.todayOrders.reduce((sum, o) => sum + Number(o.total), 0) + input.todayMarketplaceNet;

  const pending: TodayPendingAction[] = [];
  for (const order of input.pendingTransfers) {
    pending.push({
      kind: "verify-payment",
      title: `Verificar transferencia · ${order.orderNumber}`,
      meta: [order.fullName, cop(Number(order.total)), order.method === PaymentMethod.BankTransfer ? "transferencia" : null, relative(order.createdAt, now)].filter(Boolean).join(" · "),
      href: `/${storeId}/pedidos/${order.id}`,
      action: "Verificar pago",
      weight: 0,
    });
  }
  for (const order of input.awaitingPayments ?? []) {
    pending.push({
      kind: "awaiting-payment",
      title: `Pago en línea sin completar · ${order.orderNumber}`,
      meta: [order.fullName, cop(Number(order.total)), order.method === PaymentMethod.Wompi ? "Wompi" : order.method === PaymentMethod.Bold ? "Bold" : null, relative(order.createdAt, now)].filter(Boolean).join(" · "),
      href: `/${storeId}/pedidos/${order.id}#pago`,
      action: "Reenviar enlace",
      weight: 1,
    });
  }
  for (const order of input.toDispatch) {
    pending.push({
      kind: "create-guide",
      title: `Crear guía · ${order.orderNumber}`,
      meta: [order.fullName, order.city, order.paidAt ? `pagado ${relative(order.paidAt, now)}` : null].filter(Boolean).join(" · "),
      href: `/${storeId}/pedidos/${order.id}`,
      action: "Crear guía",
      weight: 2,
    });
  }
  for (const question of input.unansweredQuestions) {
    pending.push({
      kind: "answer-question",
      title: "Pregunta sin responder en Mercado Libre",
      meta: [question.productName ?? question.question.slice(0, 60), relative(question.askedAt, now)].filter(Boolean).join(" · "),
      href: `/${storeId}/mercadolibre`,
      action: "Responder",
      weight: 3,
    });
  }
  for (const quote of input.expiringQuotes) {
    pending.push({
      kind: "expiring-quote",
      title: `Cotización por vencer · ${quote.orderNumber}`,
      meta: [quote.fullName, cop(Number(quote.total)), quote.expiresAt ? `vence ${isoDay(quote.expiresAt) === isoDay(now) ? "hoy" : "mañana"}` : null].filter(Boolean).join(" · "),
      href: `/${storeId}/pedidos/${quote.id}`,
      action: "Renovar",
      weight: 4,
    });
  }
  for (const product of input.lowStockProducts) {
    pending.push({
      kind: "restock",
      title: `Reponer · ${product.name}`,
      meta: product.coverLabel ?? `${product.stock} ${product.stock === 1 ? "unidad" : "unidades"}`,
      href: `/${storeId}/productos/${product.id}`,
      action: "Aprovisionar",
      weight: 5,
    });
  }
  if ((input.inventoryIssues?.open ?? 0) > 0) {
    const { open, orphans } = input.inventoryIssues!;
    pending.push({
      kind: "inventory-issue",
      title: `${open} ${open === 1 ? "línea de inventario sin cuadrar" : "líneas de inventario sin cuadrar"}`,
      meta: "Un pedido cambió de estado pero el kardex no se movió. Reintenta o concilia antes de que el stock engañe a la tienda.",
      // Sin pedido (borrado) solo se ve en Movimientos; con pedido, la cola «Por atender» ya lo muestra.
      href: orphans > 0 && orphans === open ? `/${storeId}/movimientos-inventario#incidencias-inventario` : `/${storeId}/pedidos?vista=por-atender`,
      action: "Cuadrar",
      weight: -1,
    });
  }
  if ((input.shippingIssues?.count ?? 0) > 0) {
    const { count, sample } = input.shippingIssues!;
    const first = sample[0];
    pending.push({
      kind: "shipping-issue",
      title: `${count} ${count === 1 ? "envío con novedad" : "envíos con novedad"}`,
      meta: first
        ? `${first.orderNumber} · ${first.fullName}: ${first.stale ? "en tránsito sin novedades hace días" : SHIPPING_ISSUE_LABEL[first.status] ?? "novedad de la transportadora"}${count > 1 ? " y más" : ""}`
        : "La transportadora reportó un problema o el paquete lleva días sin moverse.",
      href: `/${storeId}/pedidos?vista=con-novedad`,
      action: "Revisar",
      weight: 0.5,
    });
  }
  if ((input.brokenImageProducts ?? 0) > 0) {
    const count = input.brokenImageProducts ?? 0;
    pending.push({
      kind: "broken-image",
      title: `${count} ${count === 1 ? "producto con imagen rota" : "productos con imagen rota"}`,
      meta: "La foto ya no existe en Cloudinary: la tienda muestra un hueco. Sube la imagen de nuevo.",
      href: `/${storeId}/productos?vista=imagen-rota`,
      action: "Revisar",
      weight: 3,
    });
  }
  pending.sort((a, b) => a.weight - b.weight);

  // Semana: 7 días terminando hoy, por día en hora de Colombia.
  const { local } = getColombiaDayBounds(now);
  const dayKeys: string[] = [];
  const dayNets = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = subDays(startOfDay(local), i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dayKeys.push(key);
    dayNets.set(key, 0);
  }
  const channels = new Map<SalesChannel, number>([["tienda", 0], ["presencial", 0], ["feria", 0], ["mercadolibre", 0]]);
  let weekNet = 0;
  for (const order of input.weekOrders) {
    const key = isoDay(order.paidAt ?? order.createdAt);
    if (dayNets.has(key)) dayNets.set(key, (dayNets.get(key) ?? 0) + Number(order.total));
    weekNet += Number(order.total);
    const channel = channelForOrderType(order.type);
    channels.set(channel, (channels.get(channel) ?? 0) + Number(order.total));
  }
  for (const order of input.weekMarketplace) {
    const net = Number(order.netAmount ?? 0);
    const key = isoDay(order.paidAt ?? order.createdAt);
    if (dayNets.has(key)) dayNets.set(key, (dayNets.get(key) ?? 0) + net);
    weekNet += net;
    channels.set("mercadolibre", (channels.get("mercadolibre") ?? 0) + net);
  }
  const previousNet = input.previousWeekOrders.reduce((sum, o) => sum + Number(o.total), 0) + input.previousWeekMarketplaceNet;
  const change = previousNet > 0 ? Math.round(((weekNet - previousNet) / previousNet) * 100) : null;

  const units = new Map<string, { productId: string | null; name: string; units: number }>();
  for (const item of input.weekItems) {
    const key = item.productId ?? item.name;
    const current = units.get(key) ?? { productId: item.productId, name: item.name, units: 0 };
    current.units += item.quantity;
    units.set(key, current);
  }
  const topProducts = Array.from(units.values()).sort((a, b) => b.units - a.units).slice(0, 3);

  const channelLabels: Record<SalesChannel, string> = { tienda: "Tienda en línea", presencial: "Presencial", feria: "Ferias", mercadolibre: "Mercado Libre (neto)" };

  return {
    generatedAt: now,
    today: { net: todayNet, orders: input.todayOrders.length, marketplaceNet: input.todayMarketplaceNet },
    toDispatch: input.toDispatchCount,
    pendingPayments: { count: input.pendingTransfers.length, amount: input.pendingTransfers.reduce((sum, o) => sum + Number(o.total), 0) },
    lowStock: {
      count: input.lowStockCount,
      outOfStock: input.outOfStockCount,
      runsOutThisWeek: input.lowStockRunsOutThisWeek ?? 0,
      outOfStockSelling: input.lowStockOutOfStockSelling ?? 0,
      threshold: input.lowStockThreshold ?? resolveLowStockThreshold(null),
      thresholdFromSettings: input.lowStockThresholdFromSettings ?? false,
    },
    pending,
    week: {
      net: weekNet,
      orders: input.weekOrders.length + input.weekMarketplace.length,
      previousNet,
      change,
      days: dayKeys.map((key) => {
        const [y, m, d] = key.split("-").map(Number);
        return { label: DAY_LABELS[new Date(y, m - 1, d).getDay()], date: key, net: dayNets.get(key) ?? 0 };
      }),
      channels: (["tienda", "mercadolibre", "presencial", "feria"] as SalesChannel[])
        .map((channel) => ({ channel, label: channelLabels[channel], net: channels.get(channel) ?? 0 }))
        .filter((c) => c.net > 0 || c.channel === "tienda"),
    },
    topProducts,
  };
}

/** Carga desde la base de datos lo que Inicio necesita para hoy. */
export async function getTodaySummary(storeId: string, now = new Date()): Promise<TodaySummary> {
  const { start: dayStart, end: dayEnd, local } = getColombiaDayBounds(now);
  const weekStart = zonedTimeToUtc(startOfDay(subDays(local, 6)), TZ);
  const previousWeekStart = zonedTimeToUtc(startOfDay(subDays(local, 13)), TZ);
  const previousWeekEnd = new Date(weekStart.getTime() - 1);
  const quoteHorizon = addDays(now, 2);
  const dispatchSince = subDays(now, DISPATCH_WINDOW_DAYS);
  const transferSince = subDays(now, TRANSFER_WINDOW_DAYS);
  const awaitingSince = subDays(now, AWAITING_PAYMENT_WINDOW_DAYS);
  const awaitingUntil = subHours(now, AWAITING_PAYMENT_STALE_HOURS);
  const staleTransitBefore = subDays(now, STALE_IN_TRANSIT_DAYS);
  // Novedad de la transportadora, o guía en camino sin cambios: lo mismo que
  // la pestaña «Con novedad» de Pedidos, para que Inicio no la esconda.
  const shippingIssueWhere = {
    storeId,
    type: { in: SHIPPABLE_TYPES },
    status: { in: [OrderStatus.PAID, OrderStatus.SENT, OrderStatus.PENDING, OrderStatus.CREATED] },
    shipping: {
      OR: [
        { status: { in: [ShippingStatus.FailedDelivery, ShippingStatus.Exception, ShippingStatus.Returned] } },
        { status: { in: [ShippingStatus.Shipped, ShippingStatus.PickedUp, ShippingStatus.InTransit, ShippingStatus.OutForDelivery] }, updatedAt: { lt: staleTransitBefore } },
      ],
    },
  };
  const dispatchWhere = {
    storeId,
    status: OrderStatus.PAID,
    type: { in: SHIPPABLE_TYPES },
    AND: [paidWithin(dispatchSince, now), { OR: [{ shipping: null }, { shipping: { trackingCode: null } }] }],
  };
  // «Por reponer» con la misma regla que Inventario: cobertura por ventas de
  // los últimos 30 días, umbral de la tienda como respaldo, sin kits (su stock
  // sale de los componentes) ni cápsulas sorpresa (se venden en feria).
  const stockWhere = { storeId, isArchived: false, isKit: false, categoryId: { not: CAPSULAS_SORPRESA_ID } };
  const lowStockBatch = Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }),
    prismadb.product.findMany({ where: stockWhere, select: { id: true, name: true, stock: true } }),
    getUnitsSoldByProduct(storeId, 30, now),
    getUnitsSoldByProduct(storeId, 90, now),
    getUnitsOnOrderByProduct(storeId),
  ]).then(([store, products, sold30, sold90, onOrder]) => {
    const threshold = resolveLowStockThreshold(store);
    const rows = products.map((product) => ({
      ...product,
      signal: computeReplenishment({
        stock: product.stock,
        sold30: sold30.get(product.id) ?? 0,
        sold90: sold90.get(product.id) ?? 0,
        onOrder: onOrder.get(product.id) ?? 0,
        threshold,
      }),
    }));
    const needs = rows.filter((row) => row.signal.needsReplenishment).sort(compareUrgency);
    return {
      threshold,
      fromSettings: hasStoreLowStockThreshold(store),
      products: needs.slice(0, 3).map((row) => ({ id: row.id, name: row.name, stock: row.stock, coverLabel: describeCover(row.signal).label })),
      count: needs.length,
      outOfStock: rows.filter((row) => row.stock <= 0).length,
      runsOutThisWeek: rows.filter((row) => row.signal.runsOutThisWeek).length,
      outOfStockSelling: rows.filter((row) => row.signal.outOfStockSelling).length,
    };
  });

  const [
    todayOrders,
    todayMarketplace,
    pendingTransfers,
    awaitingPayments,
    toDispatch,
    toDispatchCount,
    lowStock,
    unansweredQuestions,
    expiringQuotes,
    weekOrders,
    previousWeekOrders,
    weekMarketplace,
    previousWeekMarketplace,
    weekItems,
    brokenImageProducts,
    openInventoryIssues,
    orphanInventoryIssues,
    shippingIssueSample,
    shippingIssueCount,
  ] = await Promise.all([
    prismadb.order.findMany({ where: { storeId, status: { in: PAID_STATUSES }, ...paidWithin(dayStart, dayEnd) }, select: { total: true } }),
    prismadb.marketplaceOrder.findMany({ where: createSettledMarketplaceSalesWhere(storeId, { start: dayStart, end: dayEnd }), select: { netAmount: true } }),
    prismadb.order.findMany({
      where: { storeId, status: OrderStatus.PENDING, type: { in: SHIPPABLE_TYPES }, createdAt: { gte: transferSince }, payment: { method: { in: [PaymentMethod.BankTransfer] } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, orderNumber: true, fullName: true, total: true, createdAt: true, payment: { select: { method: true } } },
    }),
    prismadb.order.findMany({
      where: { storeId, status: { in: [OrderStatus.PENDING, OrderStatus.CREATED] }, type: { in: SHIPPABLE_TYPES }, createdAt: { gte: awaitingSince, lte: awaitingUntil }, payment: { method: { in: ONLINE_METHODS } } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, orderNumber: true, fullName: true, total: true, createdAt: true, payment: { select: { method: true } } },
    }),
    prismadb.order.findMany({
      where: dispatchWhere,
      orderBy: { createdAt: "asc" },
      take: 3,
      select: { id: true, orderNumber: true, fullName: true, city: true, paidAt: true, shipping: { select: { courier: true } } },
    }),
    prismadb.order.count({ where: dispatchWhere }),
    lowStockBatch,
    prismadb.marketplaceQuestion
      .findMany({
        where: { connection: { storeId }, status: "UNANSWERED" },
        orderBy: { askedAt: "desc" },
        take: 3,
        select: { id: true, question: true, askedAt: true, product: { select: { name: true } } },
      })
      .catch(() => []),
    prismadb.order.findMany({
      where: { storeId, type: OrderType.QUOTATION, status: { in: [OrderStatus.QUOTATION, OrderStatus.VIEWED] }, expiresAt: { gte: now, lte: quoteHorizon } },
      orderBy: { expiresAt: "asc" },
      take: 3,
      select: { id: true, orderNumber: true, fullName: true, total: true, expiresAt: true },
    }),
    prismadb.order.findMany({ where: { storeId, status: { in: PAID_STATUSES }, ...paidWithin(weekStart, dayEnd) }, select: { total: true, paidAt: true, createdAt: true, type: true } }),
    prismadb.order.findMany({ where: { storeId, status: { in: PAID_STATUSES }, ...paidWithin(previousWeekStart, previousWeekEnd) }, select: { total: true } }),
    prismadb.marketplaceOrder.findMany({ where: createSettledMarketplaceSalesWhere(storeId, { start: weekStart, end: dayEnd }), select: { netAmount: true, paidAt: true, createdAt: true } }),
    prismadb.marketplaceOrder.findMany({ where: createSettledMarketplaceSalesWhere(storeId, { start: previousWeekStart, end: previousWeekEnd }), select: { netAmount: true } }),
    prismadb.orderItem.findMany({
      where: { order: { storeId, status: { in: PAID_STATUSES }, ...paidWithin(weekStart, dayEnd) } },
      select: { productId: true, name: true, quantity: true },
    }),
    prismadb.product.count({ where: { storeId, isArchived: false, images: { some: { brokenAt: { not: null } } } } }),
    prismadb.orderInventoryIssue.count({ where: { storeId, resolvedAt: null } }).catch(() => 0),
    prismadb.orderInventoryIssue.count({ where: { storeId, resolvedAt: null, orderId: null } }).catch(() => 0),
    prismadb.order.findMany({
      where: shippingIssueWhere,
      orderBy: { updatedAt: "asc" },
      take: 3,
      select: { orderNumber: true, fullName: true, shipping: { select: { status: true, updatedAt: true } } },
    }),
    prismadb.order.count({ where: shippingIssueWhere }),
  ]);

  return buildTodaySummary(
    {
      now,
      todayOrders,
      todayMarketplaceNet: todayMarketplace.reduce((sum, o) => sum + Number(o.netAmount ?? 0), 0),
      pendingTransfers: pendingTransfers.map((o) => ({ ...o, method: o.payment?.method ?? null })),
      awaitingPayments: awaitingPayments.map((o) => ({ ...o, method: o.payment?.method ?? null })),
      toDispatch: toDispatch.map((o) => ({ ...o, courier: o.shipping?.courier ?? null })),
      toDispatchCount,
      lowStockProducts: lowStock.products,
      lowStockCount: lowStock.count,
      outOfStockCount: lowStock.outOfStock,
      lowStockThreshold: lowStock.threshold,
      lowStockThresholdFromSettings: lowStock.fromSettings,
      lowStockRunsOutThisWeek: lowStock.runsOutThisWeek,
      lowStockOutOfStockSelling: lowStock.outOfStockSelling,
      unansweredQuestions: unansweredQuestions.map((q) => ({ id: q.id, question: q.question, askedAt: q.askedAt, productName: q.product?.name ?? null })),
      unansweredCount: unansweredQuestions.length,
      expiringQuotes,
      weekOrders,
      previousWeekOrders,
      weekMarketplace,
      previousWeekMarketplaceNet: previousWeekMarketplace.reduce((sum, o) => sum + Number(o.netAmount ?? 0), 0),
      weekItems,
      brokenImageProducts,
      inventoryIssues: { open: openInventoryIssues, orphans: orphanInventoryIssues },
      shippingIssues: {
        count: shippingIssueCount,
        sample: shippingIssueSample.map((o) => ({
          orderNumber: o.orderNumber,
          fullName: o.fullName,
          status: o.shipping?.status ?? ShippingStatus.Exception,
          stale: Boolean(o.shipping && !([ShippingStatus.FailedDelivery, ShippingStatus.Exception, ShippingStatus.Returned] as ShippingStatus[]).includes(o.shipping.status)),
        })),
      },
    },
    storeId,
  );
}
