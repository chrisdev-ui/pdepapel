import { describe, expect, it } from "vitest";

import { canTransition, describeForbiddenTransition, getAllowedTransitions, getStatusActions, isPaidLike } from "@/lib/order-transitions";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

const standard = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.BankTransfer };
const cod = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.COD };
const quote = { type: OrderType.QUOTATION, paymentMethod: null };

describe("order transitions", () => {
  it("never lets a paid order go back to pending or draft", () => {
    expect(canTransition(OrderStatus.PAID, OrderStatus.PENDING, standard)).toBe(false);
    expect(canTransition(OrderStatus.PAID, OrderStatus.DRAFT, standard)).toBe(false);
    expect(canTransition(OrderStatus.SENT, OrderStatus.PENDING, standard)).toBe(false);
    expect(canTransition(OrderStatus.PAID, OrderStatus.SENT, standard)).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.CANCELLED, standard)).toBe(true);
    expect(describeForbiddenTransition(OrderStatus.PAID, OrderStatus.PENDING)).toContain("cancela el pedido");
    expect(isPaidLike(OrderStatus.SENT)).toBe(true);
  });

  it("lets cash on delivery ship before payment and collect after delivery", () => {
    expect(getAllowedTransitions(OrderStatus.PENDING, cod)).toContain(OrderStatus.SENT);
    expect(getAllowedTransitions(OrderStatus.PENDING, standard)).not.toContain(OrderStatus.SENT);
    expect(getAllowedTransitions(OrderStatus.SENT, cod)).toContain(OrderStatus.PAID);
    expect(getAllowedTransitions(OrderStatus.SENT, standard)).not.toContain(OrderStatus.PAID);
  });

  it("keeps the quote flow separate from the order flow", () => {
    expect(getAllowedTransitions(OrderStatus.DRAFT, quote)).toContain(OrderStatus.QUOTATION);
    expect(getAllowedTransitions(OrderStatus.DRAFT, standard)).not.toContain(OrderStatus.QUOTATION);
    expect(getAllowedTransitions(OrderStatus.ACCEPTED, quote)).toEqual([OrderStatus.PAID, OrderStatus.PENDING, OrderStatus.REJECTED, OrderStatus.CANCELLED]);
    expect(canTransition(OrderStatus.REJECTED, OrderStatus.QUOTATION, quote)).toBe(true);
    expect(canTransition(OrderStatus.PENDING, OrderStatus.PENDING, standard)).toBe(true);
  });

  it("offers explicit actions: paying always confirms, cancelling is destructive", () => {
    const pending = getStatusActions(OrderStatus.PENDING, standard);
    expect(pending).toEqual([
      { to: OrderStatus.PAID, label: "Marcar como pagado", primary: true, confirm: "pay", destructive: false },
      { to: OrderStatus.CANCELLED, label: "Cancelar pedido", primary: false, confirm: "cancel", destructive: true },
    ]);
    const paid = getStatusActions(OrderStatus.PAID, standard);
    expect(paid.map((a) => a.to)).toEqual([OrderStatus.SENT, OrderStatus.CANCELLED]);
    expect(paid[0].confirm).toBe("ship");
    expect(paid[1].label).toBe("Cancelar y devolver el inventario");
    const draftQuote = getStatusActions(OrderStatus.DRAFT, quote);
    expect(draftQuote[0]).toMatchObject({ to: OrderStatus.QUOTATION, label: "Enviar cotización", primary: true });
    expect(getStatusActions(OrderStatus.CANCELLED, standard).map((a) => a.to)).toEqual([OrderStatus.PENDING]);
    const online = getStatusActions(OrderStatus.PENDING, { type: OrderType.STANDARD, paymentMethod: PaymentMethod.Bold });
    expect(online[0]).toMatchObject({ to: OrderStatus.PAID, label: "Registrar pago a mano", primary: false, confirm: "pay" });
  });
});
