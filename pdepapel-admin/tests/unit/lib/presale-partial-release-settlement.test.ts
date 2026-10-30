import { OrderPaymentKind, OrderPaymentStatus, OrderStatus, PaymentMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getOrderQueue, getNextStep, orderMatchesView } from "@/lib/order-queues";
import { assertSettlementBalances, parseCancelSettlement, settlementContext } from "@/lib/presale-cancel-settlement";
import { sellableStock } from "@/lib/presale-owed";
import { planPartialRelease } from "@/lib/presale-release";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe("planPartialRelease", () => {
  it("salen completos los más antiguos que caben; uno grande se salta y uno pequeño entra", () => {
    const plan = planPartialRelease(
      [
        { orderId: "c", units: 1, paidAt: day(3) },
        { orderId: "a", units: 2, paidAt: day(1) },
        { orderId: "b", units: 2, paidAt: day(2) },
      ],
      3,
    );
    expect(plan).toEqual({ releaseOrderIds: ["a", "c"], releaseUnits: 3, unfulfilledOrderIds: ["b"], unfulfilledUnits: 2 });
  });

  it("con la misma fecha desempata por id, siempre igual", () => {
    const orders = [
      { orderId: "z", units: 1, paidAt: day(1) },
      { orderId: "m", units: 1, paidAt: day(1) },
    ];
    expect(planPartialRelease(orders, 1).releaseOrderIds).toEqual(["m"]);
    expect(planPartialRelease([...orders].reverse(), 1).releaseOrderIds).toEqual(["m"]);
  });

  it("justo lo vendido: todos salen; nada en bodega: ninguno", () => {
    const orders = [
      { orderId: "a", units: 2, paidAt: day(1) },
      { orderId: "b", units: 1, paidAt: day(2) },
    ];
    expect(planPartialRelease(orders, 3)).toMatchObject({ releaseUnits: 3, unfulfilledOrderIds: [] });
    expect(planPartialRelease(orders, 0)).toMatchObject({ releaseUnits: 0, unfulfilledUnits: 3 });
    expect(planPartialRelease(orders, -4)).toMatchObject({ releaseUnits: 0 });
  });
});

describe("sellableStock", () => {
  it("resta apartados y lo debido a la preventa, nunca por debajo de cero", () => {
    expect(sellableStock({ stock: 6, reservedUnits: 1 }, 4)).toBe(1);
    expect(sellableStock({ stock: 3, reservedUnits: 0 }, 5)).toBe(0);
    expect(sellableStock({ stock: 3 })).toBe(3);
  });
});

const now = new Date("2026-11-01T15:00:00Z");

describe("parseCancelSettlement", () => {
  it("sin cuerpo es null; devuelve montos enteros y exige medio y fecha si hay devolución", () => {
    expect(parseCancelSettlement(undefined)).toBeNull();
    expect(parseCancelSettlement({ retained: 30000 }, now)).toMatchObject({ refunded: 0, retained: 30000, storeCredit: 0, refundMethod: null });
    expect(() => parseCancelSettlement({ refunded: 1000 }, now)).toThrow(/por dónde devolviste/);
    expect(() => parseCancelSettlement({ refunded: 1000, refundMethod: "BankTransfer" }, now)).toThrow(/fecha/);
    expect(() => parseCancelSettlement({ refunded: 1000.5, refundMethod: "CASH", refundedAt: now.toISOString() }, now)).toThrow(/entero/);
    expect(() => parseCancelSettlement({ storeCredit: -1 }, now)).toThrow(/entero/);
    expect(() => parseCancelSettlement({ refunded: 1000, refundMethod: "PayU", refundedAt: now.toISOString() }, now)).toThrow(/por dónde/);
  });

  it("acepta el mismo día de Bogotá, no una fecha futura", () => {
    expect(parseCancelSettlement({ refunded: 1000, refundMethod: "CASH", refundedAt: "2026-11-01T12:00:00-05:00" }, now)?.refundedAt).toBeInstanceOf(Date);
    expect(() => parseCancelSettlement({ refunded: 1000, refundMethod: "CASH", refundedAt: "2026-11-05T12:00:00-05:00" }, now)).toThrow(/futuro/);
  });
});

const payment = (kind: OrderPaymentKind, amount: number, method: PaymentMethod = PaymentMethod.Bold) => ({
  kind,
  amount,
  method,
  status: OrderPaymentStatus.APPROVED,
});

describe("settlementContext + assertSettlementBalances", () => {
  const released = { isPreorder: true, preorderReleasedAt: day(2), preorderUnfulfilledAt: null };
  const unfulfilled = { isPreorder: true, preorderReleasedAt: null, preorderUnfulfilledAt: day(2) };

  it("retener hasta el anticipo pactado; con abonos, el resto se devuelve o queda a favor", () => {
    const context = settlementContext({
      status: OrderStatus.DEPOSIT_PAID,
      depositAmount: 30000,
      payments: [payment(OrderPaymentKind.DEPOSIT, 30000), payment(OrderPaymentKind.INSTALLMENT, 20000, PaymentMethod.CASH)],
      orderItems: [released],
    });
    expect(context).toMatchObject({ required: true, prepaid: 50000, maxRetained: 30000, unfulfilled: false, depositMethod: PaymentMethod.Bold });
    expect(() => assertSettlementBalances(context, { refunded: 20000, retained: 30000, storeCredit: 0 })).not.toThrow();
    expect(() => assertSettlementBalances(context, { refunded: 0, retained: 30001, storeCredit: 19999 })).toThrow(/Solo el anticipo/);
    expect(() => assertSettlementBalances(context, { refunded: 10000, retained: 0, storeCredit: 0 })).toThrow(/deben sumar/);
  });

  it("«sin unidad»: no se retiene nada", () => {
    const context = settlementContext({
      status: OrderStatus.DEPOSIT_PAID,
      depositAmount: 30000,
      payments: [payment(OrderPaymentKind.DEPOSIT, 30000)],
      orderItems: [unfulfilled],
    });
    expect(context.maxRetained).toBe(0);
    expect(() => assertSettlementBalances(context, { refunded: 0, retained: 1, storeCredit: 29999 })).toThrow(/no le alcanzó/);
  });

  it("las filas de cancelación no cuentan como pagado; un pedido pagado completo no pide la cuenta", () => {
    expect(
      settlementContext({
        status: OrderStatus.DEPOSIT_PAID,
        depositAmount: 30000,
        payments: [payment(OrderPaymentKind.DEPOSIT, 30000), payment(OrderPaymentKind.REFUND, 30000)],
        orderItems: [released],
      }).prepaid,
    ).toBe(30000);
    expect(settlementContext({ status: OrderStatus.PAID, depositAmount: 30000, payments: [payment(OrderPaymentKind.DEPOSIT, 30000)], orderItems: [released] }).required).toBe(false);
  });

  it("con anticipo pero sin fila de pago, cuenta lo pactado", () => {
    expect(settlementContext({ status: OrderStatus.DEPOSIT_PAID, depositAmount: 60000, payments: [], orderItems: [released] })).toMatchObject({
      required: true,
      prepaid: 60000,
      depositMethod: PaymentMethod.BankTransfer,
    });
  });
});

describe("cola «Preventa sin unidad»", () => {
  const order = { status: OrderStatus.DEPOSIT_PAID, type: "STANDARD" as const, heldByPresale: true, unfulfilledPresale: true };

  it("aparece en su vista y en «Por atender», con «Cancelar y devolver»", () => {
    const queue = getOrderQueue(order);
    expect(queue).toBe("presale");
    expect(orderMatchesView(queue, "sin-unidad", order)).toBe(true);
    expect(orderMatchesView(queue, "por-atender", order)).toBe(true);
    expect(getNextStep(queue, order)).toEqual({ label: "Cancelar y devolver", primary: true });
  });

  it("una preventa que solo espera no entra en ninguna de las dos", () => {
    const waiting = { ...order, unfulfilledPresale: false };
    expect(orderMatchesView("presale", "sin-unidad", waiting)).toBe(false);
    expect(orderMatchesView("presale", "por-atender", waiting)).toBe(false);
    expect(orderMatchesView("closed", "sin-unidad", { ...order, status: OrderStatus.CANCELLED })).toBe(false);
  });
});
