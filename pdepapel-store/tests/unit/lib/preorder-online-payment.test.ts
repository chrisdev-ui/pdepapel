import { describe, expect, it } from "vitest";

import { mergePolledOrder } from "@/lib/order-status-polling";
import {
  installmentProblem,
  onlinePaymentResult,
  onlinePaymentReturn,
  parsePesos,
  preorderMoneyChanged,
  returnedPayment,
  shouldPollPreorderPayment,
} from "@/lib/preorder-online-payment";
import { depositProgressText } from "@/lib/presale-copy";
import type { Order, PreorderPaymentInfo } from "@/types";

const info = (overrides: Partial<PreorderPaymentInfo> = {}): PreorderPaymentInfo => ({
  mode: "installment",
  amountDue: 130000,
  minAmount: 10000,
  block: null,
  released: false,
  unfulfilled: false,
  balanceRequested: false,
  onlinePayments: [],
  ...overrides,
});

const order = (overrides: Partial<Order> = {}) => ({ status: "DEPOSIT_PAID", paidSoFar: 30000, preorderPayment: info(), ...overrides }) as Order;

/**
 * Abonar y pagar el saldo desde `/pedido`: el regreso de la pasarela se
 * reconoce por `?pago=<orderNumber>-P<n>`, la página sigue preguntando
 * mientras un cobro esté en confirmación y avisa antes de ir a pagar con el
 * mismo mínimo y tope del servidor.
 */
describe("abonos y saldo en línea en /pedido", () => {
  it("el regreso solo cuenta con una referencia -P<n>", () => {
    expect(onlinePaymentReturn(new URLSearchParams("pago=ORD-1-P2"))).toBe("ORD-1-P2");
    expect(onlinePaymentReturn(new URLSearchParams("pago=ORD-1-A"))).toBeNull();
    expect(onlinePaymentReturn(new URLSearchParams("id=123"))).toBeNull();
  });

  it("aprobado solo cuando la administración aprobó ese mismo cobro", () => {
    const current = order({ preorderPayment: info({ onlinePayments: [{ reference: "ORD-1-P1", status: "PENDING", amount: 20000, kind: "INSTALLMENT" }] }) });
    expect(onlinePaymentResult(current, "ORD-1-P1")).toBe("pending");
    expect(onlinePaymentResult(current, "ORD-1-P9")).toBe("pending");
    const approved = order({ preorderPayment: info({ onlinePayments: [{ reference: "ORD-1-P1", status: "APPROVED", amount: 20000, kind: "INSTALLMENT" }] }) });
    expect(onlinePaymentResult(approved, "ORD-1-P1")).toBe("approved");
    expect(returnedPayment(approved, "ORD-1-P1")).toMatchObject({ amount: 20000 });
    expect(returnedPayment(approved, "ORD-1-P2")).toBeNull();
  });

  it("sigue preguntando con un cobro en confirmación; no en segundo plano ni con el pedido ya pagado", () => {
    const pending = order({ preorderPayment: info({ onlinePayments: [{ reference: "ORD-1-P1", status: "PENDING", amount: 20000, kind: "INSTALLMENT" }] }) });
    expect(shouldPollPreorderPayment(pending, null, true)).toBe(true);
    expect(shouldPollPreorderPayment(pending, null, false)).toBe(false);
    expect(shouldPollPreorderPayment(order(), "ORD-1-P3", true)).toBe(true);
    expect(shouldPollPreorderPayment(order(), null, true)).toBe(false);
    expect(shouldPollPreorderPayment({ ...pending, status: "PAID" }, "ORD-1-P1", true)).toBe(false);
  });

  it("cambio de plata: lo pagado o el estado de un cobro, aunque el estado del pedido sea el mismo", () => {
    expect(preorderMoneyChanged(order(), order())).toBe(false);
    expect(preorderMoneyChanged(order(), order({ paidSoFar: 50000 }))).toBe(true);
    expect(preorderMoneyChanged(order(), order({ preorderPayment: info({ amountDue: 110000 }) }))).toBe(true);
  });

  it("el valor escrito en pesos: con puntos o signo, sin decimales inventados", () => {
    expect(parsePesos("20.000")).toBe(20000);
    expect(parsePesos("$ 15000")).toBe(15000);
    expect(parsePesos("")).toBeNull();
    expect(parsePesos("abc")).toBeNull();
  });

  it("mínimo $10.000 y tope lo que falta, con el mismo texto del servidor", () => {
    expect(installmentProblem(info(), null)).toBe("Escribe cuánto quieres abonar.");
    expect(installmentProblem(info(), 9999)?.replace(/\s/g, " ")).toBe("El abono mínimo es $ 10.000.");
    expect(installmentProblem(info(), 130001)?.replace(/\s/g, " ")).toBe("Falta $ 130.000: el abono no puede pasar de ahí.");
    expect(installmentProblem(info(), 130000)).toBeNull();
    expect(installmentProblem(info({ amountDue: 4000, minAmount: 4000 }), 4000)).toBeNull();
  });

  it("con el saldo pedido, el avance dice el saldo con el envío", () => {
    expect(depositProgressText(50000, 122000, true).replace(/\s/g, " ")).toBe("Llevas $ 50.000 pagado · tu saldo es $ 122.000 con el envío");
    expect(depositProgressText(172000, 0, true).replace(/\s/g, " ")).toBe("Llevas $ 172.000 pagado");
  });

  it("la página enmascarada recibe lo pagado y los cobros del sondeo sin perder sus datos", () => {
    const current = { ...order(), masked: true, fullName: "C***", total: 160000 } as Order;
    const fetched = { ...order({ paidSoFar: 50000, preorderPayment: info({ amountDue: 110000 }) }), masked: true, total: 172000, fullName: "C***" } as Order;
    const merged = mergePolledOrder(current, fetched);
    expect(merged).toMatchObject({ paidSoFar: 50000, total: 172000, preorderPayment: { amountDue: 110000 }, fullName: "C***" });
  });
});

describe("el estado del pedido según la preventa", () => {
  it("esperando, ya llegó (cotizando o con saldo) y «sin unidad» dicen cosas distintas", async () => {
    const { getOrderStage, getOrderTimeline } = await import("@/lib/order-status");
    const base = { status: "DEPOSIT_PAID", createdAt: "2026-10-30T00:00:00.000Z", depositPaidAt: "2026-10-30T00:00:00.000Z" } as const;
    const with_ = (preorderPayment: Partial<PreorderPaymentInfo>) => ({ ...base, preorderPayment: info(preorderPayment) });
    const shippedDetail = (order: Parameters<typeof getOrderTimeline>[0]) => getOrderTimeline(order).find((step) => step.id === "shipped")?.detail;

    expect(getOrderStage(with_({})).description).toMatch(/^Tu preventa quedó apartada/);
    expect(shippedDetail(with_({}))).toBe("Sale cuando llegue la preventa");

    const quoting = with_({ mode: null, block: "awaiting-balance-request", released: true });
    expect(getOrderStage(quoting).description).toBe("¡Ya llegó tu producto! Estamos cotizando tu envío y te escribimos con el saldo.");
    expect(shippedDetail(quoting)).toBe("Sale cuando pagues el saldo");

    expect(getOrderStage(with_({ mode: "balance", released: true, balanceRequested: true })).description).toBe("¡Ya llegó tu producto! Paga tu saldo y lo despachamos.");

    const unfulfilled = with_({ mode: null, block: "unfulfilled", unfulfilled: true });
    expect(getOrderStage(unfulfilled).description).toMatch(/no alcanzó tu unidad.*devolución/);
    expect(shippedDetail(unfulfilled)).toBe("No alcanzó tu unidad");
  });
});
