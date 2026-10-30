import { OrderPaymentKind, OrderPaymentPlan, OrderPaymentStatus, OrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { checkOnlineAmount, MIN_ONLINE_INSTALLMENT, ONLINE_REFERENCE_PATTERN, onlineChargeReference, onlinePaymentState, type OnlinePaymentOrder } from "@/lib/preorder-online-rules";

const approved = (kind: OrderPaymentKind, amount: number) => ({ kind, status: OrderPaymentStatus.APPROVED, amount });
const waiting = { isPreorder: true, preorderReleasedAt: null, preorderUnfulfilledAt: null };
const released = { isPreorder: true, preorderReleasedAt: new Date(), preorderUnfulfilledAt: null };

const order = (overrides: Partial<OnlinePaymentOrder> = {}): OnlinePaymentOrder => ({
  status: OrderStatus.DEPOSIT_PAID,
  paymentPlan: OrderPaymentPlan.DEPOSIT,
  total: 160000,
  depositAmount: 30000,
  balanceRequestedAt: null,
  orderItems: [waiting],
  payments: [approved(OrderPaymentKind.DEPOSIT, 30000)],
  ...overrides,
});

describe("referencias de los cobros en línea", () => {
  it("son -P<n>, nunca la del anticipo ni la del saldo a mano", () => {
    expect(onlineChargeReference("ORD-1", 3)).toBe("ORD-1-P3");
    expect(ONLINE_REFERENCE_PATTERN.test("ORD-1-P12")).toBe(true);
    expect(ONLINE_REFERENCE_PATTERN.test("ORD-1-A")).toBe(false);
    expect(ONLINE_REFERENCE_PATTERN.test("ORD-1-S")).toBe(false);
    expect(ONLINE_REFERENCE_PATTERN.test("ORD-1-PX")).toBe(false);
  });
});

describe("onlinePaymentState", () => {
  it("esperando: abona entre el mínimo y lo que falta del producto (sin envío)", () => {
    expect(onlinePaymentState(order())).toEqual({ mode: "installment", amountDue: 130000, minAmount: MIN_ONLINE_INSTALLMENT, paid: 30000, block: null });
  });

  it("si falta menos que el mínimo, el mínimo es lo que falta; con todo pagado no hay nada", () => {
    expect(onlinePaymentState(order({ payments: [approved(OrderPaymentKind.DEPOSIT, 30000), approved(OrderPaymentKind.INSTALLMENT, 125000)] }))).toMatchObject({ mode: "installment", amountDue: 5000, minAmount: 5000 });
    expect(onlinePaymentState(order({ payments: [approved(OrderPaymentKind.DEPOSIT, 160000)] }))).toMatchObject({ mode: null, block: "nothing-due" });
  });

  it("liberada: sin saldo pedido no se cobra; con el saldo pedido, el valor exacto con el envío", () => {
    expect(onlinePaymentState(order({ orderItems: [released] }))).toMatchObject({ mode: null, block: "awaiting-balance-request" });
    expect(onlinePaymentState(order({ orderItems: [released], balanceRequestedAt: new Date(), total: 172000 }))).toMatchObject({ mode: "balance", amountDue: 142000, minAmount: 142000 });
  });

  it("«sin unidad», sin anticipo, cancelado o pagado: nada", () => {
    expect(onlinePaymentState(order({ orderItems: [{ ...waiting, preorderUnfulfilledAt: new Date() }] })).block).toBe("unfulfilled");
    expect(onlinePaymentState(order({ paymentPlan: OrderPaymentPlan.FULL })).block).toBe("not-deposit");
    expect(onlinePaymentState(order({ status: OrderStatus.CANCELLED })).block).toBe("not-deposit-paid");
    expect(onlinePaymentState(order({ status: OrderStatus.PAID })).block).toBe("not-deposit-paid");
  });

  it("los pendientes y lo anotado al cancelar no cuentan como pagado", () => {
    const state = onlinePaymentState(
      order({
        payments: [
          approved(OrderPaymentKind.DEPOSIT, 30000),
          { kind: OrderPaymentKind.INSTALLMENT, status: OrderPaymentStatus.PENDING, amount: 50000 },
          approved(OrderPaymentKind.REFUND, 10000),
        ],
      }),
    );
    expect(state.paid).toBe(30000);
    expect(state.amountDue).toBe(130000);
  });
});

describe("checkOnlineAmount", () => {
  const installment = onlinePaymentState(order());
  const balance = onlinePaymentState(order({ orderItems: [released], balanceRequestedAt: new Date(), total: 172000 }));

  it("abono: entero, desde el mínimo hasta lo que falta", () => {
    expect(checkOnlineAmount(installment, "installment", 10000)).toBeNull();
    expect(checkOnlineAmount(installment, "installment", 130000)).toBeNull();
    expect(checkOnlineAmount(installment, "installment", 9999)).toMatch(/mínimo es \$ 10\.000/);
    expect(checkOnlineAmount(installment, "installment", 130001)).toMatch(/Falta \$ 130\.000/);
    expect(checkOnlineAmount(installment, "installment", 15000.5)).toMatch(/sin decimales/);
    expect(checkOnlineAmount(installment, "balance", 130000)).toMatch(/cuando llegue el producto/);
  });

  it("saldo: solo el valor exacto; y explica por qué no se puede", () => {
    expect(checkOnlineAmount(balance, "balance", 142000)).toBeNull();
    expect(checkOnlineAmount(balance, "balance", 140000)).toMatch(/El saldo es \$ 142\.000/);
    expect(checkOnlineAmount(onlinePaymentState(order({ orderItems: [released] })), "balance", 1)).toMatch(/cotizando el envío/);
    expect(checkOnlineAmount(onlinePaymentState(order({ orderItems: [{ ...waiting, preorderUnfulfilledAt: new Date() }] })), "installment", 10000)).toMatch(/no alcanzó tu unidad/);
  });
});
