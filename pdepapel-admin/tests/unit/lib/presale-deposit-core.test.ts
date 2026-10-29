import { OrderPaymentPlan, OrderStatus, OrderType, PaymentMethod, PresaleDepositType, PresalePaymentMode, ProductPresaleStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { FRONTEND_STORE_URL: "https://papeleriapdepapel.com", NODE_ENV: "test" } }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));

import { boldAmountMatchesDue, depositChargeReference, getAmountDueNow, wompiCentsMatchDue } from "@/lib/order-payment-amounts";
import { canTransition, describeForbiddenTransition, getAllowedTransitions, getStatusActions, isPaidLike } from "@/lib/order-transitions";
import { getNextStep, getOrderQueue, orderMatchesView } from "@/lib/order-queues";
import { parseManualPaymentBody, parseNotifyCustomerDefaultOff } from "@/lib/order-payments";
import { getPresaleCapacity, isPresaleOverdue, parsePresaleInput, PRESALE_MAX_PER_ORDER, presaleUnitsForOrder } from "@/lib/presale";
import { presaleUnitDeposit } from "@/lib/presale-deposit";
import { presaleFeedDecision } from "@/lib/presale-feed";
import { describePresaleArrival } from "@/lib/presale-copy";

const future = new Date(Date.now() + 30 * 86_400_000);

describe("anticipo de una unidad", () => {
  it("fijo: el valor, sin pasar del precio; porcentaje: redondeado al peso", () => {
    expect(presaleUnitDeposit({ depositType: PresaleDepositType.FIXED, depositValue: 30000 }, 160000)).toBe(30000);
    expect(presaleUnitDeposit({ depositType: PresaleDepositType.FIXED, depositValue: 30000 }, 20000)).toBe(20000);
    expect(presaleUnitDeposit({ depositType: PresaleDepositType.PERCENT, depositValue: 20 }, 160000)).toBe(32000);
    expect(presaleUnitDeposit({ depositType: PresaleDepositType.PERCENT, depositValue: 33 }, 9999)).toBe(3300);
    expect(presaleUnitDeposit({ depositType: null, depositValue: null }, 160000)).toBe(160000);
  });
});

describe("lo que se cobra hoy", () => {
  const base = { total: 160000, giftCardAmount: 0, depositAmount: 30000 };
  it("un pedido normal cobra el total menos la tarjeta", () => {
    expect(getAmountDueNow({ ...base, paymentPlan: OrderPaymentPlan.FULL, status: OrderStatus.PENDING, giftCardAmount: 10000 })).toBe(150000);
  });
  it("con anticipo: el anticipo pendiente, el saldo con anticipo recibido, nada pagado", () => {
    expect(getAmountDueNow({ ...base, paymentPlan: OrderPaymentPlan.DEPOSIT, status: OrderStatus.PENDING })).toBe(30000);
    expect(getAmountDueNow({ ...base, paymentPlan: OrderPaymentPlan.DEPOSIT, status: OrderStatus.DEPOSIT_PAID }, 30000)).toBe(130000);
    expect(getAmountDueNow({ ...base, paymentPlan: OrderPaymentPlan.DEPOSIT, status: OrderStatus.PAID }, 30000)).toBe(0);
  });
  it("la referencia del anticipo y los montos de Bold y Wompi", () => {
    expect(depositChargeReference("ORD-1-2")).toBe("ORD-1-2-A");
    expect(boldAmountMatchesDue(30000, { total: 30000 })).toBe(true);
    expect(boldAmountMatchesDue(30000, { total: 160000 })).toBe(false);
    expect(boldAmountMatchesDue(30000, { total: 29999 })).toBe(false);
    expect(wompiCentsMatchDue(30000, { amount_in_cents: 3000000, currency: "COP" })).toBe(true);
    expect(wompiCentsMatchDue(30000, { amount_in_cents: 16000000, currency: "COP" })).toBe(false);
  });
});

describe("«Avisar a la clienta» en anticipo y saldo", () => {
  it("ausente es NO avisar (al revés que el cambio de estado)", () => {
    expect(parseNotifyCustomerDefaultOff({})).toBe(false);
    expect(parseNotifyCustomerDefaultOff(null)).toBe(false);
    expect(parseNotifyCustomerDefaultOff({ notifyCustomer: undefined })).toBe(false);
    expect(parseNotifyCustomerDefaultOff({ notifyCustomer: true })).toBe(true);
    expect(parseNotifyCustomerDefaultOff({ notifyCustomer: "sí" })).toBeNull();
  });
  it("el cuerpo del pago a mano: valor, fecha no futura, medio conocido", () => {
    const now = new Date("2026-10-28T15:00:00Z");
    expect(parseManualPaymentBody({ amount: 30000, method: PaymentMethod.BankTransfer }, now)).toMatchObject({ amount: 30000, notifyCustomer: false });
    expect(() => parseManualPaymentBody({ amount: 0, method: PaymentMethod.BankTransfer }, now)).toThrow();
    expect(() => parseManualPaymentBody({ amount: 30000, method: PaymentMethod.COD }, now)).toThrow();
    expect(() => parseManualPaymentBody({ amount: 30000, method: PaymentMethod.CASH, paidAt: "2026-11-30" }, now)).toThrow();
  });
});

describe("campaña de preventa", () => {
  it("sin tope y sin fecha es válida; con anticipo exige tipo y valor", () => {
    expect(parsePresaleInput({ productId: "p", paymentMode: "DEPOSIT", depositType: "FIXED", depositValue: 30000 })).toMatchObject({
      unitLimit: null,
      expectedArrivalAt: null,
      paymentMode: PresalePaymentMode.DEPOSIT,
      depositValue: 30000,
    });
    expect(() => parsePresaleInput({ productId: "p", paymentMode: "DEPOSIT" })).toThrow();
    expect(() => parsePresaleInput({ productId: "p", paymentMode: "DEPOSIT", depositType: "PERCENT", depositValue: 100 })).toThrow();
    expect(() => parsePresaleInput({ productId: "p", expectedArrivalAt: "2020-01-01" })).toThrow();
    expect(parsePresaleInput({ productId: "p", unitLimit: 40, expectedArrivalAt: future.toISOString() }).paymentMode).toBe(PresalePaymentMode.FULL);
  });
  it("sin tope: 5 por pedido; sin fecha nunca está vencida", () => {
    const capacity = getPresaleCapacity({ unitLimit: null, committedUnits: 7 });
    expect(capacity.remaining).toBeNull();
    expect(presaleUnitsForOrder(capacity)).toBe(PRESALE_MAX_PER_ORDER);
    expect(presaleUnitsForOrder(getPresaleCapacity({ unitLimit: 10, committedUnits: 8 }))).toBe(2);
    expect(isPresaleOverdue({ status: ProductPresaleStatus.ACTIVE, expectedArrivalAt: null })).toBe(false);
  });
  it("la fecha que se le dice a la clienta", () => {
    expect(describePresaleArrival({ expectedArrivalAt: null, expectedArrivalText: null })).toBe("Fecha estimada: por confirmar");
    expect(describePresaleArrival({ expectedArrivalAt: null, expectedArrivalText: "primera semana de diciembre" })).toBe("Fecha estimada: primera semana de diciembre");
    expect(describePresaleArrival({ expectedArrivalAt: new Date("2026-12-05T17:00:00Z") })).toBe("Fecha estimada: 5 de diciembre");
  });
  it("feeds: sin fecha fuera; con fecha preorder con availability_date de Bogotá", () => {
    expect(presaleFeedDecision({})).toEqual({ kind: "none" });
    expect(presaleFeedDecision({ presales: [{ expectedArrivalAt: null }] })).toEqual({ kind: "skip" });
    expect(presaleFeedDecision({ presales: [{ expectedArrivalAt: new Date("2026-12-05T03:00:00Z") }] })).toEqual({ kind: "preorder", availabilityDate: "2026-12-04T00:00-05:00" });
  });
});

describe("estado «Anticipo recibido»", () => {
  const ctx = { type: OrderType.STANDARD, paymentMethod: PaymentMethod.BankTransfer, paymentPlan: OrderPaymentPlan.DEPOSIT };
  it("el anticipo y el saldo no se marcan con el cambio de estado genérico", () => {
    expect(getAllowedTransitions(OrderStatus.PENDING, ctx)).toEqual([OrderStatus.CANCELLED]);
    expect(getAllowedTransitions(OrderStatus.DEPOSIT_PAID, ctx)).toEqual([OrderStatus.CANCELLED]);
    expect(canTransition(OrderStatus.PENDING, OrderStatus.DEPOSIT_PAID, ctx)).toBe(false);
    expect(canTransition(OrderStatus.DEPOSIT_PAID, OrderStatus.PAID, ctx)).toBe(false);
    expect(getAllowedTransitions(OrderStatus.CANCELLED, ctx)).toEqual([]);
    expect(describeForbiddenTransition(OrderStatus.DEPOSIT_PAID, OrderStatus.PAID)).toContain("Marcar saldo recibido");
    expect(getStatusActions(OrderStatus.DEPOSIT_PAID, ctx).map((action) => action.label)).toEqual(["Cancelar preventa"]);
  });
  it("un pedido normal sigue igual", () => {
    expect(getAllowedTransitions(OrderStatus.PENDING, { ...ctx, paymentPlan: OrderPaymentPlan.FULL })).toContain(OrderStatus.PAID);
  });
  it("cuenta como «ya entró plata» (cancelar devuelve), no como venta", () => {
    expect(isPaidLike(OrderStatus.DEPOSIT_PAID)).toBe(true);
  });
  it("colas: espera la preventa; liberada, «Cobrar saldo» en Por atender", () => {
    const order = { status: OrderStatus.DEPOSIT_PAID, type: OrderType.STANDARD, payment: { method: PaymentMethod.BankTransfer }, shipping: null };
    expect(getOrderQueue({ ...order, heldByPresale: true })).toBe("presale");
    expect(getOrderQueue({ ...order, heldByPresale: false })).toBe("balance");
    expect(getNextStep("balance")).toEqual({ label: "Cobrar saldo", primary: true });
    expect(orderMatchesView("balance", "por-atender")).toBe(true);
    expect(orderMatchesView("presale", "por-atender")).toBe(false);
  });
});
