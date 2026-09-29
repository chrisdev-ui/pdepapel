import { describe, expect, it } from "vitest";

import { OrderStatus, PaymentMethod } from "@/constants";
import { getOrderStage, getOrderTimeline, isAwaitingPayment, isGiftCardPurchase } from "@/lib/order-status";

/**
 * Una compra de tarjeta de regalo no se empaca ni se envía: pagada, está
 * «enviada por correo»; pendiente, sigue el vocabulario de siempre.
 */
const base = {
  type: "GIFT_CARD",
  createdAt: "2026-09-28T12:00:00.000Z",
  paidAt: null as string | null,
  shipping: null,
  payment: { method: PaymentMethod.BankTransfer },
};

describe("gift card purchase on the order page", () => {
  it("is recognised by type only", () => {
    expect(isGiftCardPurchase({ type: "GIFT_CARD" })).toBe(true);
    expect(isGiftCardPurchase({ type: "STANDARD" })).toBe(false);
    expect(isGiftCardPurchase({})).toBe(false);
  });

  it("reads as delivered by email once paid, with a three-step timeline", () => {
    const order = { ...base, status: OrderStatus.PAID, paidAt: "2026-09-28T12:05:00.000Z" };
    const stage = getOrderStage(order as never);
    expect(stage).toMatchObject({ stage: "delivered", label: "Tarjeta enviada por correo", tone: "success" });
    expect(stage.description).toContain("ya salió por correo");
    expect(isAwaitingPayment(order as never)).toBe(false);

    const steps = getOrderTimeline(order as never);
    expect(steps.map((step) => [step.id, step.state])).toEqual([
      ["created", "done"],
      ["paid", "done"],
      ["shipped", "done"],
    ]);
    expect(steps[2].label).toBe("Tarjeta enviada por correo");
  });

  it("keeps the payment vocabulary while the transfer is pending", () => {
    const order = { ...base, status: OrderStatus.PENDING };
    expect(getOrderStage(order as never).stage).toBe("verifying");
    expect(isAwaitingPayment(order as never)).toBe(true);
    const steps = getOrderTimeline(order as never);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toMatchObject({ state: "current", detail: "Esperando la verificación del pago" });
    expect(steps[2]).toMatchObject({ state: "pending", detail: "Sale en cuanto el pago se confirme" });
  });

  it("does not change a normal order", () => {
    const order = { ...base, type: "STANDARD", status: OrderStatus.PAID, paidAt: "2026-09-28T12:05:00.000Z", shipping: { status: "Preparing", provider: "ENVIOCLICK" } };
    expect(getOrderStage(order as never).stage).toBe("paid");
    expect(getOrderTimeline(order as never)).toHaveLength(4);
  });
});
