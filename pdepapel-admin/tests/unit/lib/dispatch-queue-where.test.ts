import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const resolved = <T,>(value: T) => vi.fn().mockResolvedValue(value);
  return {
    order: { findMany: resolved([]), count: resolved(0) },
    marketplaceOrder: { findMany: resolved([]) },
    marketplaceQuestion: { findMany: resolved([]) },
    orderItem: { findMany: resolved([]), groupBy: resolved([]) },
    orderInventoryIssue: { count: resolved(0) },
    product: { findMany: resolved([]), count: resolved(0) },
    store: { findUnique: resolved(null) },
    restockOrderItem: { findMany: resolved([]) },
    marketplaceOrderItem: { groupBy: resolved([]) },
  };
});

vi.mock("@/lib/prismadb", () => ({ default: db }));
vi.mock("@/lib/store-access", () => ({ requireStoreRead: vi.fn(async () => ({ userId: "user_owner", role: "owner" })) }));
vi.mock("@/lib/payment-webhook-events", () => ({ countRecentPaymentWebhookIssues: vi.fn(async () => ({ count: 0, latest: null })) }));

import { getTodaySummary } from "@/lib/dashboard-today";
import { dispatchQueueWhere, getOrderQueue, NOT_DISPATCHABLE_SHIPPING_STATUSES, getNextStep, orderMatchesView, pickupQueueWhere, type QueueableOrder } from "@/lib/order-queues";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

const now = new Date("2026-10-25T15:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

type Fixture = QueueableOrder & {
  id: string;
  storeId: string;
  orderItems: { isPreorder: boolean; preorderReleasedAt: Date | null }[];
};

const shipping = (status: ShippingStatus, trackingCode: string | null = null, provider: ShippingProvider = ShippingProvider.ENVIOCLICK) => ({ status, trackingCode, provider });
const pickup = (status: ShippingStatus = ShippingStatus.Preparing) => shipping(status, null, ShippingProvider.NONE);

const order = (id: string, overrides: Partial<Fixture>): Fixture => ({
  id,
  storeId: "s1",
  status: OrderStatus.PAID,
  type: OrderType.STANDARD,
  createdAt: daysAgo(3),
  paidAt: daysAgo(2),
  payment: { method: PaymentMethod.Bold },
  shipping: shipping(ShippingStatus.Preparing),
  orderItems: [],
  ...overrides,
});

const FIXTURES: Fixture[] = [
  order("sin-envio", { shipping: null }),
  order("recoge", { shipping: pickup() }),
  order("recoge-entregado", { shipping: pickup(ShippingStatus.Delivered) }),
  order("recoge-enviado", { status: OrderStatus.SENT, shipping: pickup() }),
  order("recoge-viejo", { paidAt: daysAgo(40), createdAt: daysAgo(41), shipping: pickup() }),
  order("recoge-presencial", { type: OrderType.POINT_OF_SALE, payment: { method: PaymentMethod.CASH }, shipping: null }),
  order("recoge-contra-entrega", { status: OrderStatus.PENDING, paidAt: null, payment: { method: PaymentMethod.COD }, shipping: pickup() }),
  order("preparando", { shipping: shipping(ShippingStatus.Preparing) }),
  order("guia-vacia", { shipping: shipping(ShippingStatus.Preparing, "") }),
  order("envio-cancelado", { shipping: shipping(ShippingStatus.Cancelled) }),
  order("entregado-a-mano", { shipping: shipping(ShippingStatus.Delivered) }),
  order("en-camino-sin-guia", { shipping: shipping(ShippingStatus.InTransit) }),
  order("en-reparto", { shipping: shipping(ShippingStatus.OutForDelivery) }),
  order("novedad", { shipping: shipping(ShippingStatus.Exception) }),
  order("devuelto", { shipping: shipping(ShippingStatus.Returned) }),
  order("con-guia", { shipping: shipping(ShippingStatus.Preparing, "ENV-123") }),
  order("viejo", { paidAt: daysAgo(40), createdAt: daysAgo(41) }),
  order("sin-fecha-de-pago", { paidAt: null, createdAt: daysAgo(4) }),
  order("sin-fecha-de-pago-viejo", { paidAt: null, createdAt: daysAgo(45) }),
  order("enviado", { status: OrderStatus.SENT }),
  order("presencial", { type: OrderType.POINT_OF_SALE, payment: { method: PaymentMethod.CASH } }),
  order("feria", { type: OrderType.FESTIVAL, payment: { method: PaymentMethod.CASH } }),
  order("tarjeta-regalo", { type: OrderType.GIFT_CARD }),
  order("personalizado", { type: OrderType.CUSTOM }),
  order("contra-entrega", { status: OrderStatus.PENDING, paidAt: null, payment: { method: PaymentMethod.COD } }),
  order("contra-entrega-vieja", { status: OrderStatus.CREATED, paidAt: null, createdAt: daysAgo(60), payment: { method: PaymentMethod.COD } }),
  order("contra-entrega-con-guia", { status: OrderStatus.PENDING, paidAt: null, payment: { method: PaymentMethod.COD }, shipping: shipping(ShippingStatus.Preparing, "ENV-9") }),
  order("contra-entrega-entregada", { status: OrderStatus.PENDING, paidAt: null, payment: { method: PaymentMethod.COD }, shipping: shipping(ShippingStatus.Delivered) }),
  order("transferencia", { status: OrderStatus.PENDING, paidAt: null, payment: { method: PaymentMethod.BankTransfer } }),
  order("pago-en-linea", { status: OrderStatus.PENDING, paidAt: null }),
  order("cancelado", { status: OrderStatus.CANCELLED }),
  order("borrador", { status: OrderStatus.DRAFT, paidAt: null }),
  order("otra-tienda", { storeId: "s2" }),
];

/** Lo justo de la semántica de `where` de Prisma para los operadores que usan estas consultas. */
const FILTER_KEYS = new Set(["in", "notIn", "gte", "gt", "lte", "lt", "equals", "not"]);
const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

function matchesFilter(value: unknown, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([op, operand]) => {
    switch (op) {
      case "in":
        return (operand as unknown[]).some((item) => same(item, value));
      case "notIn":
        return value !== null && value !== undefined && !(operand as unknown[]).some((item) => same(item, value));
      case "gte":
        return value instanceof Date && value.getTime() >= (operand as Date).getTime();
      case "gt":
        return value instanceof Date && value.getTime() > (operand as Date).getTime();
      case "lte":
        return value instanceof Date && value.getTime() <= (operand as Date).getTime();
      case "lt":
        return value instanceof Date && value.getTime() < (operand as Date).getTime();
      case "equals":
        return same(value, operand);
      case "not":
        return operand === null ? value !== null && value !== undefined : !same(value, operand);
      default:
        throw new Error(`operador sin soporte: ${op}`);
    }
  });
}

function matches(row: Record<string, unknown> | null | undefined, where: Record<string, unknown>): boolean {
  if (!row) return false;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (Array.isArray(condition) ? condition : [condition]).every((w) => matches(row, w));
    if (key === "OR") return (condition as Record<string, unknown>[]).some((w) => matches(row, w));
    if (key === "NOT") return !(Array.isArray(condition) ? condition : [condition]).some((w) => matches(row, w));
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (typeof condition !== "object" || condition instanceof Date) return same(value, condition);
    const object = condition as Record<string, unknown>;
    if ("some" in object) return ((value as Record<string, unknown>[] | undefined) ?? []).some((item) => matches(item, object.some as Record<string, unknown>));
    if (Object.keys(object).every((op) => FILTER_KEYS.has(op))) return matchesFilter(value, object);
    return matches(value as Record<string, unknown> | null, object);
  });
}

const pedidosEnVista = (view: "por-despachar" | "por-entregar") => (rows: Fixture[]) =>
  rows.filter((row) => row.storeId === "s1" && orderMatchesView(getOrderQueue(row, now), view, row, now)).map((row) => row.id);
const pedidosPorDespachar = pedidosEnVista("por-despachar");
const pedidosPorEntregar = pedidosEnVista("por-entregar");
const idsMatching = (where: unknown) => FIXTURES.filter((row) => matches(row as unknown as Record<string, unknown>, where as Record<string, unknown>)).map((row) => row.id);

describe("dispatchQueueWhere", () => {
  it("selects exactly the orders Pedidos puts in «Por despachar»", () => {
    const where = dispatchQueueWhere("s1", now) as Record<string, unknown>;
    const fromWhere = FIXTURES.filter((row) => matches(row as unknown as Record<string, unknown>, where)).map((row) => row.id);
    expect(fromWhere).toEqual(pedidosPorDespachar(FIXTURES));
    expect(fromWhere).not.toContain("entregado-a-mano");
    expect(fromWhere).toContain("contra-entrega-vieja");
  });

  it("excludes exactly the shipping states getOrderQueue keeps out of dispatch", () => {
    const outOfDispatch = Object.values(ShippingStatus).filter(
      (status) => getOrderQueue(order("x", { shipping: shipping(status) }), now) !== "dispatch",
    );
    expect([...NOT_DISPATCHABLE_SHIPPING_STATUSES].sort()).toEqual(outOfDispatch.sort());
  });
});

describe("pickupQueueWhere", () => {
  it("selects exactly the orders Pedidos puts in «Por entregar en tienda»", () => {
    const fromWhere = idsMatching(pickupQueueWhere("s1", now));
    expect(fromWhere).toEqual(pedidosPorEntregar(FIXTURES));
    expect([...fromWhere].sort()).toEqual(["recoge", "recoge-contra-entrega", "sin-envio"]);
  });

  it("never shares an order with «Por despachar»", () => {
    const dispatch = new Set(idsMatching(dispatchQueueWhere("s1", now)));
    expect(idsMatching(pickupQueueWhere("s1", now)).filter((id) => dispatch.has(id))).toEqual([]);
  });

  it("keeps pickups in «Por atender» with «Marcar entregado» as the next step", () => {
    const row = FIXTURES.find((fixture) => fixture.id === "recoge")!;
    const queue = getOrderQueue(row, now);
    expect(orderMatchesView(queue, "por-atender", row, now)).toBe(true);
    expect(getNextStep(queue, row, now)).toEqual({ label: "Marcar entregado", primary: true });
  });
});

describe("Inicio «Por despachar»", () => {
  beforeEach(() => {
    db.order.count.mockReset().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => FIXTURES.filter((row) => matches(row as unknown as Record<string, unknown>, where)).length);
  });

  it("counts the same orders as the Pedidos queue", async () => {
    const summary = await getTodaySummary("s1", now);
    expect(summary.toDispatch).toBe(pedidosPorDespachar(FIXTURES).length);
    expect(summary.toDispatch).toBeGreaterThan(0);
    expect(summary.toPickup).toBe(pedidosPorEntregar(FIXTURES).length);
    expect(summary.toPickup).toBe(3);
  });

  it("still leaves out an order waiting on a presale", async () => {
    const held = order("preventa", { orderItems: [{ isPreorder: true, preorderReleasedAt: null }] });
    FIXTURES.push(held);
    try {
      const summary = await getTodaySummary("s1", now);
      expect(summary.toDispatch).toBe(pedidosPorDespachar(FIXTURES).length - 1);
    } finally {
      FIXTURES.pop();
    }
  });
});
