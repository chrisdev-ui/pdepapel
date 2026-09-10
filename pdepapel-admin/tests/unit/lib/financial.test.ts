import {
  calculateGatewayFee,
  calculateOrderFinancials,
  calculateTotalProductCost,
  getOrderNetProfit,
  getProductUnitCost,
} from "@/lib/financial";
import { PaymentMethod } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

describe("financial helpers", () => {
  it("calculates gateway fees only for Wompi payments", () => {
    expect(calculateGatewayFee(100000, PaymentMethod.Wompi)).toBe(3986.5);
    // Efectivo, contra entrega y transferencia no pagan pasarela.
    expect(calculateGatewayFee(100000, PaymentMethod.CASH)).toBe(0);
    expect(calculateGatewayFee(100000, PaymentMethod.COD)).toBe(0);
    expect(calculateGatewayFee(100000, PaymentMethod.BankTransfer)).toBe(0);
    // Bold sigue en 0 a la espera de confirmar el contrato; ver el TODO en
    // lib/financial.ts. Si se confirma que cobra comision, esta linea cambia.
    expect(calculateGatewayFee(100000, PaymentMethod.Bold)).toBe(0);
  });

  it("el margen estimado usa la misma comision que el calculo principal", () => {
    // Antes `getOrderNetProfit` repetia la tarifa de Wompi a mano.
    const order = {
      total: 100000,
      totalProductCost: 40000,
      payment: { method: PaymentMethod.Wompi },
      shipping: { cost: 10000 },
    };
    const expected =
      100000 - 40000 - calculateGatewayFee(100000, PaymentMethod.Wompi) - 10000;
    expect(getOrderNetProfit(order)).toBeCloseTo(expected, 6);
  });

  it("uses product acquisition costs only for catalog items", async () => {
    const prismadb = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "product-id", acqPrice: 2000, isKit: false, kitComponents: [] },
          ]),
      },
    };

    await expect(
      calculateTotalProductCost(
        [
          { productId: "product-id", quantity: 3 },
          { productId: null, quantity: 2 },
        ] as any,
        prismadb,
      ),
    ).resolves.toBe(6000);
    expect(prismadb.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["product-id"] } },
      select: {
        id: true,
        acqPrice: true,
        isKit: true,
        kitComponents: {
          select: { quantity: true, component: { select: { acqPrice: true } } },
        },
      },
    });
  });

  it("costs a kit from its components, not from its own acqPrice", async () => {
    // El formulario obligaba a escribir un acqPrice ficticio en los kits; si el
    // costo saliera de ahi la misma venta tendria un margen en linea y otro en
    // el punto de venta (que si suma los componentes).
    const prismadb = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "kit-id",
            acqPrice: 1,
            isKit: true,
            kitComponents: [
              { quantity: 2, component: { acqPrice: 3000 } },
              { quantity: 1, component: { acqPrice: 4000 } },
            ],
          },
        ]),
      },
    };

    await expect(
      calculateTotalProductCost(
        [{ productId: "kit-id", quantity: 2 }] as any,
        prismadb,
      ),
    ).resolves.toBe(20000);
  });

  it("costs a kit the same way the point of sale does", async () => {
    const kit = {
      acqPrice: 1,
      isKit: true,
      kitComponents: [
        { quantity: 2, component: { acqPrice: 3000 } },
        { quantity: 1, component: { acqPrice: 4000 } },
      ],
    };
    expect(getProductUnitCost(kit)).toBe(10000);
    expect(
      getProductUnitCost({ acqPrice: 2500, isKit: false, kitComponents: [] }),
    ).toBe(2500);
  });

  it("builds payment financials from sales, cost, and shipping", async () => {
    const prismadb = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: "product-id", acqPrice: 10000, isKit: false, kitComponents: [] },
          ]),
      },
    };

    await expect(
      calculateOrderFinancials(
        {
          total: 40000,
          orderItems: [{ productId: "product-id", quantity: 2 }],
        } as any,
        PaymentMethod.Bold,
        5000,
        prismadb,
      ),
    ).resolves.toEqual({
      totalProductCost: 20000,
      gatewayFee: 0,
      shippingCost: 5000,
      netProfit: 15000,
      profitMarginPct: 37.5,
    });
  });

  it("uses stored profit when available and computes a reliable fallback otherwise", () => {
    expect(getOrderNetProfit({ netProfit: "24000" })).toBe(24000);
    expect(
      getOrderNetProfit({
        total: 100000,
        payment: { method: PaymentMethod.Wompi },
        shipping: { cost: 10000 },
        orderItems: [{ product: { acqPrice: 20000 }, quantity: 2 }],
      }),
    ).toBe(46013.5);
  });
});
