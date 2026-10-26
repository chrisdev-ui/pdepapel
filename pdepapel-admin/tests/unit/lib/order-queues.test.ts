import { describe, expect, it } from "vitest";

import { getInventoryIssueBadge, getNextStep, getOrderQueue, getPaymentBadge, getShippingBadge, hasOpenInventoryIssues, isAwaitingPaymentStale, isExpiringSoon, orderMatchesView } from "@/lib/order-queues";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

const order = (overrides: Partial<Parameters<typeof getOrderQueue>[0]>) => ({
  status: OrderStatus.PENDING,
  type: OrderType.STANDARD,
  payment: { method: PaymentMethod.BankTransfer },
  shipping: { status: ShippingStatus.Preparing, trackingCode: null, provider: ShippingProvider.ENVIOCLICK },
  ...overrides,
});
const pickup = (status: ShippingStatus = ShippingStatus.Preparing) => ({ status, trackingCode: null, provider: ShippingProvider.NONE });

describe("order queues", () => {
  it("puts pending transfers in verify and pending online payments in awaiting", () => {
    expect(getOrderQueue(order({}))).toBe("verify");
    expect(getOrderQueue(order({ payment: { method: PaymentMethod.Bold } }))).toBe("awaiting-payment");
    expect(getNextStep("verify")).toEqual({ label: "Verificar pago", primary: true });
  });

  it("sends paid orders without a guide to dispatch and with a guide to in-transit", () => {
    expect(getOrderQueue(order({ status: OrderStatus.PAID }))).toBe("dispatch");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: { status: ShippingStatus.Preparing, provider: ShippingProvider.ENVIOCLICK, trackingCode: null } }))).toBe("dispatch");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: { status: ShippingStatus.Preparing, provider: ShippingProvider.ENVIOCLICK, trackingCode: "ABC" } }))).toBe("in-transit");
    expect(getOrderQueue(order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.InTransit, provider: ShippingProvider.ENVIOCLICK, trackingCode: "ABC" } }))).toBe("in-transit");
  });

  it("ages paid orders without a guide out of dispatch after 30 days", () => {
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(getOrderQueue(order({ status: OrderStatus.PAID, paidAt: old }))).toBe("completed");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, paidAt: null, createdAt: old }))).toBe("completed");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, paidAt: recent }))).toBe("dispatch");
  });

  it("treats cash on delivery as dispatch before the guide exists", () => {
    expect(getOrderQueue(order({ payment: { method: PaymentMethod.COD } }))).toBe("dispatch");
    expect(getOrderQueue(order({ payment: { method: PaymentMethod.COD }, shipping: { status: ShippingStatus.Shipped, provider: ShippingProvider.ENVIOCLICK, trackingCode: "X" } }))).toBe("in-transit");
  });

  it("puts paid pickups in «Por entregar en tienda» until they are handed over", () => {
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: null }))).toBe("pickup");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: pickup() }))).toBe("pickup");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: pickup(ShippingStatus.Delivered) }))).toBe("delivered");
    expect(getOrderQueue(order({ status: OrderStatus.SENT, shipping: pickup() }))).toBe("delivered");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, type: OrderType.GIFT_CARD, shipping: null }))).toBe("completed");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, type: OrderType.POINT_OF_SALE, payment: { method: PaymentMethod.CASH }, shipping: null }))).toBe("completed");
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    expect(getOrderQueue(order({ status: OrderStatus.PAID, paidAt: old, shipping: pickup() }))).toBe("completed");
    expect(getOrderQueue(order({ payment: { method: PaymentMethod.COD }, shipping: pickup() }))).toBe("pickup");
    expect(getOrderQueue(order({ shipping: null }))).toBe("verify");
    expect(getNextStep("pickup")).toEqual({ label: "Marcar entregado", primary: true });
    expect(getShippingBadge(order({ status: OrderStatus.PAID, shipping: pickup() }))).toEqual({ label: "Recoge en tienda", tone: "cream" });
    expect(getShippingBadge(order({ status: OrderStatus.PAID, shipping: null }))).toEqual({ label: "Recoge en tienda", tone: "cream" });
    expect(getShippingBadge(order({ status: OrderStatus.SENT, shipping: pickup(ShippingStatus.Delivered) }))).toEqual({ label: "Entregado", tone: "mint" });
    expect(getShippingBadge(order({ status: OrderStatus.PAID }))).toEqual({ label: "Sin guía", tone: "slate" });
    expect(orderMatchesView("pickup", "por-atender")).toBe(true);
    expect(orderMatchesView("pickup", "por-entregar")).toBe(true);
    expect(orderMatchesView("pickup", "por-despachar")).toBe(false);
    expect(orderMatchesView("dispatch", "por-entregar")).toBe(false);
  });

  it("flags carrier problems, deliveries, counter sales, quotes and closed orders", () => {
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: { status: ShippingStatus.FailedDelivery, provider: ShippingProvider.ENVIOCLICK, trackingCode: "X" } }))).toBe("issue");
    expect(getOrderQueue(order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.Delivered, provider: ShippingProvider.ENVIOCLICK, trackingCode: "X" } }))).toBe("delivered");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, type: OrderType.POINT_OF_SALE, payment: { method: PaymentMethod.CASH } }))).toBe("completed");
    expect(getOrderQueue(order({ status: OrderStatus.QUOTATION, type: OrderType.QUOTATION, payment: null }))).toBe("quote");
    expect(getOrderQueue(order({ status: OrderStatus.CANCELLED }))).toBe("closed");
  });

  it("builds the work views from the queues", () => {
    expect(orderMatchesView("verify", "por-atender")).toBe(true);
    expect(orderMatchesView("dispatch", "por-atender")).toBe(true);
    expect(orderMatchesView("issue", "por-atender")).toBe(true);
    expect(orderMatchesView("in-transit", "por-atender")).toBe(false);
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000);
    expect(orderMatchesView("quote", "por-atender", order({ status: OrderStatus.QUOTATION, type: OrderType.QUOTATION, expiresAt: soon }))).toBe(true);
    expect(orderMatchesView("quote", "por-atender", order({ status: OrderStatus.QUOTATION, type: OrderType.QUOTATION, expiresAt: null }))).toBe(false);
    expect(orderMatchesView("closed", "todos")).toBe(true);
    expect(isExpiringSoon(new Date(Date.now() - 1000))).toBe(false);
  });

  it("surfaces online payments that stayed pending for more than two hours, up to 14 days", () => {
    const now = new Date("2026-09-10T15:00:00.000Z");
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
    const fresh = order({ payment: { method: PaymentMethod.Bold }, createdAt: minutesAgo(30) });
    const stale = order({ payment: { method: PaymentMethod.Wompi }, createdAt: minutesAgo(3 * 60) });
    const abandoned = order({ payment: { method: PaymentMethod.Bold }, createdAt: minutesAgo(20 * 24 * 60) });

    expect(getOrderQueue(fresh, now)).toBe("awaiting-payment");
    expect(isAwaitingPaymentStale(fresh, now)).toBe(false);
    expect(isAwaitingPaymentStale(stale, now)).toBe(true);
    expect(isAwaitingPaymentStale(abandoned, now)).toBe(false);
    expect(isAwaitingPaymentStale(order({ payment: { method: PaymentMethod.Bold }, createdAt: null }), now)).toBe(false);

    expect(orderMatchesView("awaiting-payment", "por-atender", fresh, now)).toBe(false);
    expect(orderMatchesView("awaiting-payment", "por-atender", stale, now)).toBe(true);
    expect(orderMatchesView("awaiting-payment", "por-atender", abandoned, now)).toBe(false);
    expect(orderMatchesView("awaiting-payment", "todos", abandoned, now)).toBe(true);

    expect(getNextStep("awaiting-payment", fresh, now)).toEqual({ label: "Reenviar enlace de pago", primary: false });
    expect(getNextStep("awaiting-payment", stale, now)).toEqual({ label: "Reenviar enlace de pago", primary: true });
    expect(getPaymentBadge(fresh, now)).toEqual({ label: "Pago en línea pendiente", tone: "cream" });
    expect(getPaymentBadge(stale, now)).toEqual({ label: "Pago en línea sin completar", tone: "pink" });
  });

  it("labels payment and shipping without emoji", () => {
    expect(getPaymentBadge(order({}))).toEqual({ label: "Por verificar", tone: "cream" });
    expect(getPaymentBadge(order({ status: OrderStatus.PAID }))).toEqual({ label: "Pagado", tone: "mint" });
    expect(getShippingBadge(order({ status: OrderStatus.PAID }))).toEqual({ label: "Sin guía", tone: "slate" });
    expect(getShippingBadge(order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.OutForDelivery, provider: ShippingProvider.ENVIOCLICK, trackingCode: "X" } }))).toEqual({ label: "En reparto", tone: "sky" });
    expect(getShippingBadge(order({ type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID }))).toBeNull();
  });

  it("names the real payment method of a point-of-sale sale instead of a generic «Pagado»", () => {
    const pos = (method: PaymentMethod, status: OrderStatus = OrderStatus.PAID) =>
      getPaymentBadge(order({ type: OrderType.POINT_OF_SALE, status, payment: { method } }));
    expect(pos(PaymentMethod.CASH)).toEqual({ label: "Efectivo", tone: "mint" });
    expect(pos(PaymentMethod.BankTransfer)).toEqual({ label: "Transferencia", tone: "mint" });
    expect(pos(PaymentMethod.Bold)).toEqual({ label: "Datáfono", tone: "mint" });
    expect(pos(PaymentMethod.Bold, OrderStatus.PENDING)).toEqual({ label: "Datáfono pendiente", tone: "cream" });
    // Una transferencia de la tienda en línea sigue diciendo «Pagado».
    expect(getPaymentBadge(order({ status: OrderStatus.PAID }))).toEqual({ label: "Pagado", tone: "mint" });
  });

  it("keeps an order with unreconciled inventory in por-atender while it is still active", () => {
    const paidAndShipped = order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.InTransit, provider: ShippingProvider.ENVIOCLICK, trackingCode: "X" }, openInventoryIssues: 2 });
    expect(getOrderQueue(paidAndShipped)).toBe("in-transit");
    expect(orderMatchesView("in-transit", "por-atender", paidAndShipped)).toBe(true);
    expect(orderMatchesView("in-transit", "por-atender", order({ ...paidAndShipped, openInventoryIssues: 0 }))).toBe(false);
    expect(hasOpenInventoryIssues(paidAndShipped)).toBe(true);
    expect(getInventoryIssueBadge(paidAndShipped)).toEqual({ label: "Inventario sin cuadrar", tone: "pink" });
    expect(getInventoryIssueBadge(order({}))).toBeNull();
  });

  it("a delivered or closed order with unreconciled inventory leaves por-atender and shows in sin-cuadrar (the 4 orders of 2026-10-26)", () => {
    // Pedidos de transferencia viejos, entregados, con líneas que no se descontaron: Paula ya terminó con ellos.
    const deliveredPickup = order({ status: OrderStatus.SENT, payment: { method: PaymentMethod.BankTransfer }, shipping: { status: ShippingStatus.Delivered, provider: ShippingProvider.NONE, trackingCode: null }, openInventoryIssues: 13 });
    expect(getOrderQueue(deliveredPickup)).toBe("delivered");
    expect(orderMatchesView("delivered", "por-atender", deliveredPickup)).toBe(false);
    expect(orderMatchesView("delivered", "sin-cuadrar", deliveredPickup)).toBe(true);
    expect(orderMatchesView("delivered", "sin-cuadrar", order({ ...deliveredPickup, openInventoryIssues: 0 }))).toBe(false);
    expect(orderMatchesView("completed", "por-atender", order({ type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID, openInventoryIssues: 1 }))).toBe(false);
  });

  it("turns a guide with no news for days into a pink badge and a por-atender item", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const stale = order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.InTransit, provider: ShippingProvider.ENVIOCLICK, trackingCode: "X", updatedAt: days(7) } });
    const fresh = order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.InTransit, provider: ShippingProvider.ENVIOCLICK, trackingCode: "X", updatedAt: days(1) } });
    expect(getShippingBadge(stale, now)).toEqual({ label: "Sin novedades hace 7 días", tone: "pink" });
    expect(getShippingBadge(fresh, now)).toEqual({ label: "En camino", tone: "sky" });
    expect(orderMatchesView("in-transit", "con-novedad", stale, now)).toBe(true);
    expect(orderMatchesView("in-transit", "por-atender", stale, now)).toBe(true);
    expect(orderMatchesView("in-transit", "con-novedad", fresh, now)).toBe(false);
    expect(orderMatchesView("in-transit", "por-atender", fresh, now)).toBe(false);
  });
});

describe("getRiskBadges", () => {
  it("marca el posible bot y la tarjeta en revisión, y nada en un pedido normal", async () => {
    const { getRiskBadges } = await import("@/lib/order-queues");
    expect(getRiskBadges({ riskScore: 0, giftCardReview: null })).toEqual([]);
    expect(getRiskBadges({ riskScore: 1, giftCardReview: null })).toEqual([]);
    expect(getRiskBadges({ riskScore: 2, giftCardReview: "PENDING" })).toEqual([
      { label: "⚠️ Posible bot", tone: "pink" },
      { label: "Tarjeta en revisión", tone: "cream" },
    ]);
    expect(getRiskBadges({ riskScore: 0, giftCardReview: "REJECTED" })).toEqual([{ label: "Tarjeta rechazada", tone: "slate" }]);
    expect(getRiskBadges({ riskScore: 0, giftCardReview: "APPROVED" })).toEqual([]);
    expect(getRiskBadges({ riskScore: 12, riskReasons: "envio-rapido,fraude-confirmado", giftCardReview: null })).toEqual([{ label: "Fraude/bot", tone: "slate" }]);
    expect(getRiskBadges({ riskScore: 0, riskReasons: "pago-en-cancelado", giftCardReview: null })).toEqual([{ label: "Pago en pedido cancelado", tone: "pink" }]);
  });
});
