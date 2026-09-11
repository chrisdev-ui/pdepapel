import { describe, expect, it } from "vitest";

import { buildOrderTimeline, getNextStepCard } from "@/lib/order-timeline";
import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

const now = new Date("2026-09-07T21:00:00.000Z");
const base = {
  createdAt: new Date("2026-09-07T20:29:00.000Z"),
  status: OrderStatus.PENDING,
  type: OrderType.STANDARD,
  payment: { method: PaymentMethod.BankTransfer },
  shipping: null,
};

describe("order timeline", () => {
  it("marks payment as the current step for a pending transfer and points to the status field", () => {
    const steps = buildOrderTimeline(base, now);
    expect(steps.map((s) => [s.id, s.state])).toEqual([["created", "done"], ["paid", "now"], ["guide", "todo"], ["transit", "todo"], ["delivered", "todo"]]);
    expect(steps[1].meta).toBe("Esperando el comprobante");
    const card = getNextStepCard(base, "s1", now)!;
    expect(card.queue).toBe("verify");
    expect(card.primary).toEqual({ label: "Marcar como pagado", href: "#pago", action: "pay" });
    expect(card.consequence).toContain("inventario");
  });

  it("moves to the guide step once paid and to transit once the carrier has it", () => {
    const paid = { ...base, status: OrderStatus.PAID, paidAt: new Date("2026-09-07T20:40:00.000Z"), shipping: { status: ShippingStatus.Preparing, trackingCode: null, courier: "COORDINADORA", carrierName: "Coordinadora" } };
    expect(buildOrderTimeline(paid, now).map((s) => s.state)).toEqual(["done", "done", "now", "todo", "todo"]);
    expect(getNextStepCard(paid, "s1", now)).toMatchObject({ queue: "dispatch", primary: { href: "#envio" } });

    const moving = { ...paid, status: OrderStatus.SENT, shipping: { ...paid.shipping, trackingCode: "ABC123", trackingUrl: "https://track/ABC123", status: ShippingStatus.InTransit } };
    const steps = buildOrderTimeline(moving, now);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "now", "todo"]);
    expect(steps[2].meta).toBe("Coordinadora · ABC123");
    expect(getNextStepCard(moving, "s1", now)).toMatchObject({ queue: "in-transit", primary: { label: "Ver seguimiento", href: "https://track/ABC123" } });
  });

  it("flags carrier problems and closes delivered orders", () => {
    const failed = { ...base, status: OrderStatus.SENT, shipping: { status: ShippingStatus.FailedDelivery, trackingCode: "X" } };
    expect(getNextStepCard(failed, "s1", now)).toMatchObject({ queue: "issue", tone: "pink" });
    const delivered = { ...base, status: OrderStatus.SENT, shipping: { status: ShippingStatus.Delivered, trackingCode: "X", actualDeliveryDate: new Date("2026-09-09T15:00:00.000Z") } };
    const steps = buildOrderTimeline(delivered, now);
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(getNextStepCard(delivered, "s1", now)?.queue).toBe("delivered");
  });

  it("uses a shorter timeline for counter sales and a quote timeline for quotes", () => {
    const pos = { ...base, type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID, payment: { method: PaymentMethod.CASH } };
    expect(buildOrderTimeline(pos, now).map((s) => s.id)).toEqual(["created", "paid", "delivered"]);
    const quote = { ...base, type: OrderType.QUOTATION, status: OrderStatus.QUOTATION, payment: null, expiresAt: new Date("2026-09-09T12:00:00.000Z") };
    const steps = buildOrderTimeline(quote, now);
    expect(steps.map((s) => s.id)).toEqual(["created", "sent", "accepted", "paid"]);
    expect(getNextStepCard(quote, "s1", now)?.description).toContain("Válida hasta");
  });

  it("marks cancelled orders as closed with skipped steps", () => {
    const cancelled = { ...base, status: OrderStatus.CANCELLED };
    const steps = buildOrderTimeline(cancelled, now);
    expect(steps.at(-1)).toMatchObject({ id: "closed", label: "Cancelado", state: "now" });
    expect(steps[1].state).toBe("skipped");
    expect(getNextStepCard(cancelled, "s1", now)).toBeNull();
  });
});
