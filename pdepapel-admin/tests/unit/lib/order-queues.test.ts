import { describe, expect, it } from "vitest";

import { getNextStep, getOrderQueue, getPaymentBadge, getShippingBadge, isExpiringSoon, orderMatchesView } from "@/lib/order-queues";
import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

const order = (overrides: Partial<Parameters<typeof getOrderQueue>[0]>) => ({
  status: OrderStatus.PENDING,
  type: OrderType.STANDARD,
  payment: { method: PaymentMethod.BankTransfer },
  shipping: null,
  ...overrides,
});

describe("order queues", () => {
  it("puts pending transfers in verify and pending online payments in awaiting", () => {
    expect(getOrderQueue(order({}))).toBe("verify");
    expect(getOrderQueue(order({ payment: { method: PaymentMethod.Bold } }))).toBe("awaiting-payment");
    expect(getNextStep("verify")).toEqual({ label: "Verificar pago", primary: true });
  });

  it("sends paid orders without a guide to dispatch and with a guide to in-transit", () => {
    expect(getOrderQueue(order({ status: OrderStatus.PAID }))).toBe("dispatch");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: { status: ShippingStatus.Preparing, trackingCode: null } }))).toBe("dispatch");
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: { status: ShippingStatus.Preparing, trackingCode: "ABC" } }))).toBe("in-transit");
    expect(getOrderQueue(order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.InTransit, trackingCode: "ABC" } }))).toBe("in-transit");
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
    expect(getOrderQueue(order({ payment: { method: PaymentMethod.COD }, shipping: { status: ShippingStatus.Shipped, trackingCode: "X" } }))).toBe("in-transit");
  });

  it("flags carrier problems, deliveries, counter sales, quotes and closed orders", () => {
    expect(getOrderQueue(order({ status: OrderStatus.PAID, shipping: { status: ShippingStatus.FailedDelivery, trackingCode: "X" } }))).toBe("issue");
    expect(getOrderQueue(order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.Delivered, trackingCode: "X" } }))).toBe("delivered");
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

  it("labels payment and shipping without emoji", () => {
    expect(getPaymentBadge(order({}))).toEqual({ label: "Por verificar", tone: "cream" });
    expect(getPaymentBadge(order({ status: OrderStatus.PAID }))).toEqual({ label: "Pagado", tone: "mint" });
    expect(getShippingBadge(order({ status: OrderStatus.PAID }))).toEqual({ label: "Sin guía", tone: "slate" });
    expect(getShippingBadge(order({ status: OrderStatus.SENT, shipping: { status: ShippingStatus.OutForDelivery, trackingCode: "X" } }))).toEqual({ label: "En reparto", tone: "sky" });
    expect(getShippingBadge(order({ type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID }))).toBeNull();
  });
});
