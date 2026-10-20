import { calculateGatewayFee, calculateOrderFinancials, getOrderNetProfit } from "@/lib/financial";
import { BOLD_ONLINE_FEE, BOLD_TERMINAL_MARKER, gatewayChannelOf, gatewayFee, keepTerminalMarker } from "@/lib/gateway-fees";
import { orderFinancialsPlan } from "@/lib/order-financials-backfill";
import { OrderSource, OrderType, PaymentMethod } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const db = (acqPrice = 40000) => ({ product: { findMany: vi.fn().mockResolvedValue([{ id: "p1", acqPrice, transportationCost: null, isKit: false, kitComponents: [] }]) } });
const order = (extra: Record<string, unknown> = {}) =>
  ({ id: "o1", total: 100000, giftCardAmount: 0, type: OrderType.STANDARD, orderItems: [{ productId: "p1", quantity: 1 }], ...extra }) as never;

describe("gatewayFee (lib/gateway-fees.ts)", () => {
  it("Bold en línea cobra la tarifa pública: (2,99 % + $900) × 1,19, y está marcada como sin verificar", () => {
    expect(gatewayFee(100000, PaymentMethod.Bold)).toBe(4629.1);
    expect(gatewayFee(12900, PaymentMethod.Bold)).toBe(1529.99);
    expect(BOLD_ONLINE_FEE.verified).toBe(false);
  });

  it("el datáfono Bold es desconocido (null), nunca 0", () => {
    expect(gatewayFee(100000, PaymentMethod.Bold, { channel: "terminal" })).toBeNull();
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

  it("un cobro en el datáfono guarda la comisión en null y la ganancia sin ella", async () => {
    const metrics = await calculateOrderFinancials(order({ type: OrderType.POINT_OF_SALE }), PaymentMethod.Bold, 0, db());
    expect(metrics.gatewayFee).toBeNull();
    expect(metrics.netProfit).toBe(60000);
    expect(Number.isNaN(metrics.profitMarginPct)).toBe(false);
  });

  it("una tarjeta de regalo cobrada en el datáfono no da NaN", async () => {
    const metrics = await calculateOrderFinancials(order({ type: OrderType.GIFT_CARD, source: OrderSource.POS }), PaymentMethod.Bold, 0, db());
    expect(metrics).toMatchObject({ gatewayFee: null, netProfit: 0, totalProductCost: 0 });
  });

  it("la ganancia estimada usa la misma regla: datáfono sin comisión, en línea con ella", () => {
    const base = { total: 100000, totalProductCost: 40000, shipping: { cost: 0 } };
    expect(getOrderNetProfit({ ...base, type: OrderType.POINT_OF_SALE, payment: { method: PaymentMethod.Bold } })).toBe(60000);
    expect(getOrderNetProfit({ ...base, payment: { method: PaymentMethod.Bold } })).toBeCloseTo(100000 - 40000 - 4629.1, 6);
  });

  it("el relleno de financieros deja la comisión en null para un cobro de datáfono", async () => {
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
    expect(plan.rows[0]).toMatchObject({ gatewayFee: null, netProfit: 60000 });
  });
});
