import {
  calculateGatewayFee,
  calculateOrderFinancials,
  calculateTotalProductCost,
  getOrderNetProfit,
} from "@/lib/financial";
import { PaymentMethod } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

describe("financial helpers", () => {
  it("calculates gateway fees only for Wompi payments", () => {
    expect(calculateGatewayFee(100000, PaymentMethod.Wompi)).toBe(3986.5);
    expect(calculateGatewayFee(100000, PaymentMethod.Bold)).toBe(0);
    expect(calculateGatewayFee(100000, PaymentMethod.BankTransfer)).toBe(0);
  });

  it("uses product acquisition costs only for catalog items", async () => {
    const prismadb = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "product-id", acqPrice: 2000 }]),
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
      select: { id: true, acqPrice: true },
    });
  });

  it("builds payment financials from sales, cost, and shipping", async () => {
    const prismadb = {
      product: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "product-id", acqPrice: 10000 }]),
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
