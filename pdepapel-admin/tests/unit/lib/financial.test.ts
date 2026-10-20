import {
  calculateGatewayFee,
  calculateOrderFinancials,
  calculateTotalProductCost,
  getOrderNetProfit,
  getProductUnitCost,
  getProductUnitShipping,
} from "@/lib/financial";
import { PaymentMethod } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

describe("financial helpers", () => {
  it("calculates gateway fees for Wompi and Bold online payments", () => {
    expect(calculateGatewayFee(100000, PaymentMethod.Wompi)).toBe(3986.5);
    // Efectivo, contra entrega y transferencia no pagan pasarela.
    expect(calculateGatewayFee(100000, PaymentMethod.CASH)).toBe(0);
    expect(calculateGatewayFee(100000, PaymentMethod.COD)).toBe(0);
    expect(calculateGatewayFee(100000, PaymentMethod.BankTransfer)).toBe(0);
    // Tarifa pública de Bold en línea, Cuenta digital Bold al día siguiente (lib/gateway-fees.ts).
    expect(calculateGatewayFee(100000, PaymentMethod.Bold)).toBe(4629.1);
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
      100000 - 40000 - calculateGatewayFee(100000, PaymentMethod.Wompi)! - 10000;
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
        transportationCost: true,
        isKit: true,
        kitComponents: {
          select: { quantity: true, component: { select: { acqPrice: true, transportationCost: true } } },
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
      productShippingCost: 0,
      productShippingMissing: true,
      // Bold en línea: (2,99 % de 40.000 + 900) × 1,19.
      gatewayFee: 2494.24,
      shippingCost: 5000,
      netProfit: expect.closeTo(12505.76, 6),
      profitMarginPct: expect.closeTo(31.2644, 6),
    });
  });

  it("el costo de un pedido nuevo suma el envío por unidad conocido y dice si faltó", async () => {
    const prismadb = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          { id: "con-envio", acqPrice: 10000, transportationCost: 500, isKit: false, kitComponents: [] },
          { id: "sin-envio", acqPrice: 4000, transportationCost: null, isKit: false, kitComponents: [] },
        ]),
      },
    };
    const order = (items: { productId: string; quantity: number }[]) => ({ total: 40000, orderItems: items }) as any;

    // 2 × (10.000 + 500) = 21.000; ganancia 40.000 − 21.000 − 5.000 de envío al cliente.
    await expect(calculateOrderFinancials(order([{ productId: "con-envio", quantity: 2 }]), PaymentMethod.BankTransfer, 5000, prismadb)).resolves.toMatchObject({
      totalProductCost: 21000,
      productShippingCost: 1000,
      productShippingMissing: false,
      netProfit: 14000,
    });
    // La línea sin envío entra solo con la compra y el pedido queda marcado.
    await expect(
      calculateOrderFinancials(order([{ productId: "con-envio", quantity: 1 }, { productId: "sin-envio", quantity: 1 }]), PaymentMethod.BankTransfer, 0, prismadb),
    ).resolves.toMatchObject({ totalProductCost: 14500, productShippingCost: 500, productShippingMissing: true });
  });

  it("envío por unidad: 0, vacío y el 1.000 heredado no son valores; un kit suma el de sus piezas", () => {
    expect(getProductUnitShipping({ transportationCost: 700 })).toBe(700);
    expect(getProductUnitShipping({ transportationCost: 0 })).toBeNull();
    expect(getProductUnitShipping({ transportationCost: 1000 })).toBeNull();
    expect(getProductUnitShipping({ transportationCost: null })).toBeNull();
    const kit = (second: number | null) => ({
      isKit: true,
      transportationCost: 9999,
      kitComponents: [
        { quantity: 2, component: { transportationCost: 300 } },
        { quantity: 1, component: { transportationCost: second } },
      ],
    });
    expect(getProductUnitShipping(kit(400))).toBe(1000);
    expect(getProductUnitShipping(kit(null))).toBeNull();
  });

  it("una ganancia guardada de 0 con su costo es un pedido sin ganancia; NULL es lo único que falta", () => {
    const base = {
      total: 100000,
      payment: { method: PaymentMethod.BankTransfer },
      shipping: { cost: 10000 },
      orderItems: [{ product: { acqPrice: 20000 }, quantity: 2 }],
    };
    // Con costo guardado, el 0 vale tal cual: no se recalcula con el costo de hoy.
    expect(getOrderNetProfit({ ...base, netProfit: 0, totalProductCost: 90000 })).toBe(0);
    // Sin ganancia guardada: se calcula con el costo guardado, o con el de los productos si tampoco está.
    expect(getOrderNetProfit({ ...base, netProfit: null, totalProductCost: 50000 })).toBe(40000);
    expect(getOrderNetProfit({ ...base, netProfit: null, totalProductCost: null })).toBe(50000);
    // Un 0 sin costo guardado sigue siendo un dato faltante (pedidos viejos).
    expect(getOrderNetProfit({ ...base, netProfit: 0, totalProductCost: null })).toBe(50000);
  });

  it("solo compra (el relleno de pedidos viejos): no suma el envío por unidad", async () => {
    const prismadb = {
      product: { findMany: vi.fn().mockResolvedValue([{ id: "p", acqPrice: 10000, transportationCost: 500, isKit: false, kitComponents: [] }]) },
    };
    const order = { total: 40000, orderItems: [{ productId: "p", quantity: 2 }] } as any;
    await expect(calculateOrderFinancials(order, PaymentMethod.BankTransfer, 5000, prismadb, { purchaseOnly: true })).resolves.toMatchObject({
      totalProductCost: 20000,
      productShippingCost: 0,
      netProfit: 15000,
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
