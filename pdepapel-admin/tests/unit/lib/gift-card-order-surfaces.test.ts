import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { buildOrderTimeline, getNextStepCard } from "@/lib/order-timeline";
import { getOrderChannel, getOrderQueue, getShippingBadge } from "@/lib/order-queues";
import { canTransition, describeForbiddenTransition, getAllowedTransitions, getStatusActions } from "@/lib/order-transitions";

/**
 * Una compra de tarjeta de regalo nunca habla de envío en el panel: ni
 * insignia de guía, ni cola de despacho, ni paso «Guía» en la línea de
 * tiempo, ni «crear la guía» como siguiente paso.
 */
const purchase = (status: OrderStatus) => ({
  id: "order-1",
  type: OrderType.GIFT_CARD,
  status,
  createdAt: new Date("2026-09-28T12:00:00.000Z"),
  paidAt: status === OrderStatus.PAID ? new Date("2026-09-28T12:05:00.000Z") : null,
  shipping: null,
  payment: { method: PaymentMethod.BankTransfer },
  inventoryIssues: [],
});

describe("gift card purchase surfaces in the panel", () => {
  it("has no shipping badge and never lands in the dispatch queue", () => {
    expect(getShippingBadge(purchase(OrderStatus.PAID) as never)).toBeNull();
    expect(getOrderQueue(purchase(OrderStatus.PAID) as never)).toBe("completed");
    expect(getOrderQueue(purchase(OrderStatus.PENDING) as never)).toBe("verify");
    expect(getOrderChannel(OrderType.GIFT_CARD)).toEqual({ id: "regalo", label: "Tarjeta de regalo" });
  });

  it("shows created, paid and 'sent by email' instead of guide and transit", () => {
    const steps = buildOrderTimeline(purchase(OrderStatus.PAID) as never);
    expect(steps.map((step) => step.id)).toEqual(["created", "paid", "delivered"]);
    expect(steps[2]).toMatchObject({ label: "Enviada por correo", state: "done" });
    const pending = buildOrderTimeline(purchase(OrderStatus.PENDING) as never);
    expect(pending[2]).toMatchObject({ state: "todo", meta: "sale al confirmar el pago" });
  });

  it("never offers «Marcar como enviado» and cancels by voiding the card", () => {
    const paid = getStatusActions(OrderStatus.PAID, { type: OrderType.GIFT_CARD, paymentMethod: PaymentMethod.Bold });
    expect(paid.map((action) => action.to)).toEqual([OrderStatus.CANCELLED]);
    expect(paid[0]?.label).toBe("Cancelar y anular la tarjeta");
    expect(getAllowedTransitions(OrderStatus.PENDING, { type: OrderType.GIFT_CARD, paymentMethod: PaymentMethod.COD })).toEqual([
      OrderStatus.PAID,
      OrderStatus.CANCELLED,
    ]);
    expect(canTransition(OrderStatus.PAID, OrderStatus.SENT, { type: OrderType.GIFT_CARD })).toBe(false);
    expect(describeForbiddenTransition(OrderStatus.PAID, OrderStatus.SENT, { type: OrderType.GIFT_CARD })).toContain("no se envía");
    // Un pedido normal sigue igual.
    expect(getAllowedTransitions(OrderStatus.PAID, { type: OrderType.STANDARD })).toEqual([OrderStatus.SENT, OrderStatus.CANCELLED]);
  });

  it("offers the gift-card list as the next step once paid, never the guide", () => {
    const card = getNextStepCard(purchase(OrderStatus.PAID) as never, "store-1");
    expect(card?.title).toBe("Tarjeta de regalo emitida");
    expect(card?.primary.href).toBe("/store-1/tarjetas-regalo");
    expect(JSON.stringify(card)).not.toContain("guía");
    const pending = getNextStepCard(purchase(OrderStatus.PENDING) as never, "store-1");
    expect(pending?.title).toBe("Siguiente paso: verificar la transferencia");
  });
});
