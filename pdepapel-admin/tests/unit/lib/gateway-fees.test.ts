import { calculateGatewayFee, calculateOrderFinancials, getOrderNetProfit } from "@/lib/financial";
import { BOLD_FEE_BASIS, BOLD_PAYOUT_PLAN, BOLD_PUBLIC_RATES, BOLD_TERMINAL_MARKER, gatewayChannelOf, gatewayFee, keepTerminalMarker } from "@/lib/gateway-fees";
import { orderFinancialsPlan } from "@/lib/order-financials-backfill";
import { OrderSource, OrderType, PaymentMethod } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const db = (acqPrice = 40000) => ({ product: { findMany: vi.fn().mockResolvedValue([{ id: "p1", acqPrice, transportationCost: null, isKit: false, kitComponents: [] }]) } });
const order = (extra: Record<string, unknown> = {}) =>
  ({ id: "o1", total: 100000, giftCardAmount: 0, type: OrderType.STANDARD, orderItems: [{ productId: "p1", quantity: 1 }], ...extra }) as never;

describe("gatewayFee (lib/gateway-fees.ts)", () => {
  it("Bold en línea cobra la tarifa pública del plan de la Cuenta digital Bold al día siguiente: (2,99 % + $900) × 1,19", () => {
    expect(BOLD_PAYOUT_PLAN).toBe("nextDayBoldAccount");
    expect(BOLD_FEE_BASIS).toBe("tarifa pública de Bold consultada el 2026-10-20");
    expect(gatewayFee(100000, PaymentMethod.Bold)).toBe(4629.1);
    expect(gatewayFee(12900, PaymentMethod.Bold)).toBe(1529.99);
  });

  it("el datáfono Bold cobra su tarifa pública: (2,69 % + $300) × 1,19, nunca 0", () => {
    expect(gatewayFee(100000, PaymentMethod.Bold, { channel: "terminal" })).toBe(3558.1);
  });

  it("los otros planes publicados quedan en la tabla para cambiar de plan sin buscarlos", () => {
    expect(BOLD_PUBLIC_RATES.otherBanks.online).toEqual({ percent: 0.0359, fixed: 900, vat: 0.19 });
    expect(BOLD_PUBLIC_RATES.otherBanks.terminal).toEqual({ percent: 0.0329, fixed: 300, vat: 0.19 });
  });

  it("Wompi no cambia y efectivo, transferencia y contra entrega siguen en 0", () => {
    expect(gatewayFee(100000, PaymentMethod.Wompi)).toBe(3986.5);
    for (const method of [PaymentMethod.CASH, PaymentMethod.COD, PaymentMethod.BankTransfer, undefined]) expect(gatewayFee(100000, method)).toBe(0);
  });

  it("el canal es datáfono en el punto de venta, en feria o con la marca del pago", () => {
    expect(gatewayChannelOf({ type: OrderType.POINT_OF_SALE })).toBe("terminal");
    expect(gatewayChannelOf({ source: OrderSource.POS })).toBe("terminal");
    expect(gatewayChannelOf({ source: OrderSource.FAIR })).toBe("terminal");
    expect(gatewayChannelOf({ type: OrderType.STANDARD, payment: { details: `Pedido · ${BOLD_TERMINAL_MARKER}` } })).toBe("terminal");
    expect(gatewayChannelOf({ type: OrderType.STANDARD, source: OrderSource.STORE, payment: { details: "Bold Transaction ID: x" } })).toBe("online");
  });

  it("el webhook conserva la marca al reescribir el detalle del pago", () => {
    expect(keepTerminalMarker(`Pedido · ${BOLD_TERMINAL_MARKER}`, "Bold Transaction ID: t")).toBe(`Bold Transaction ID: t | ${BOLD_TERMINAL_MARKER}`);
    expect(keepTerminalMarker("Pago en línea", "Bold Transaction ID: t")).toBe("Bold Transaction ID: t");
    expect(keepTerminalMarker(null, "Bold Transaction ID: t")).toBe("Bold Transaction ID: t");
  });
});

describe("finanzas con la comisión compartida", () => {
  it("un pedido Bold en línea pagado guarda la comisión y la ganancia baja en lo mismo", async () => {
    const metrics = await calculateOrderFinancials(order(), PaymentMethod.Bold, 10000, db());
    expect(metrics.gatewayFee).toBe(4629.1);
    expect(metrics.netProfit).toBeCloseTo(100000 - 40000 - 4629.1 - 10000, 6);
    expect(calculateGatewayFee(100000, PaymentMethod.Bold)).toBe(4629.1);
  });

  it("un cobro en el datáfono guarda la comisión del datáfono y la ganancia baja en lo mismo", async () => {
    const metrics = await calculateOrderFinancials(order({ type: OrderType.POINT_OF_SALE }), PaymentMethod.Bold, 0, db());
    expect(metrics.gatewayFee).toBe(3558.1);
    expect(metrics.netProfit).toBeCloseTo(60000 - 3558.1, 6);
    expect(Number.isNaN(metrics.profitMarginPct)).toBe(false);
  });

  it("una tarjeta de regalo cobrada en el datáfono no da NaN", async () => {
    const metrics = await calculateOrderFinancials(order({ type: OrderType.GIFT_CARD, source: OrderSource.POS }), PaymentMethod.Bold, 0, db());
    expect(metrics).toMatchObject({ gatewayFee: 3558.1, netProfit: -3558.1, totalProductCost: 0 });
  });

  it("la ganancia estimada usa la misma regla: cada canal con su comisión", () => {
    const base = { total: 100000, totalProductCost: 40000, shipping: { cost: 0 } };
    expect(getOrderNetProfit({ ...base, type: OrderType.POINT_OF_SALE, payment: { method: PaymentMethod.Bold } })).toBeCloseTo(60000 - 3558.1, 6);
    expect(getOrderNetProfit({ ...base, payment: { method: PaymentMethod.Bold } })).toBeCloseTo(100000 - 40000 - 4629.1, 6);
  });

  it("el relleno de financieros usa la comisión del datáfono para un cobro de datáfono", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "o1",
        total: 100000,
        giftCardAmount: 0,
        type: OrderType.STANDARD,
        payment: { method: PaymentMethod.Bold, details: BOLD_TERMINAL_MARKER },
        shipping: { cost: 0, codFee: 0 },
        orderItems: [{ productId: "p1", quantity: 1, product: { acqPrice: 40000, isKit: false, kitComponents: [] } }],
      },
    ]);
    const plan = await orderFinancialsPlan({ order: { findMany }, ...db() } as never);
    expect(plan.rows[0]).toMatchObject({ gatewayFee: 3558.1, netProfit: expect.closeTo(60000 - 3558.1, 6) });
  });
});
