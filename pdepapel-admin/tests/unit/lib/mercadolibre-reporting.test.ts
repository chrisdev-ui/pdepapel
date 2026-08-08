import { describe, expect, it } from "vitest";

import {
  createSettledMarketplaceSalesWhere,
  getMarketplaceItemNetRevenue,
  getMarketplaceNetRevenue,
  getMarketplaceOrderNetProfit,
  getMarketplaceSaleDate,
} from "@/lib/mercadolibre/reporting";

describe("Mercado Libre reporting", () => {
  const paidAt = new Date("2026-08-05T18:00:00.000Z");
  const createdAt = new Date("2026-08-05T19:00:00.000Z");
  const order = {
    paidAt,
    createdAt,
    netAmount: 46457,
    items: [
      {
        quantity: 1,
        unitPrice: 50000,
        product: { acqPrice: 20000 },
      },
      {
        quantity: 1,
        unitPrice: 19000,
        product: { acqPrice: 5000 },
      },
    ],
  };

  it("only selects paid sales with a settled net amount", () => {
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-08-31T23:59:59.999Z");

    expect(
      createSettledMarketplaceSalesWhere("store-1", { start, end }),
    ).toEqual({
      connection: { storeId: "store-1" },
      status: "PAID",
      netAmount: { not: null },
      paidAt: { gte: start, lte: end },
    });
  });

  it("uses the actual payment date and settled amount", () => {
    expect(getMarketplaceSaleDate(order)).toEqual(paidAt);
    expect(getMarketplaceSaleDate({ ...order, paidAt: null })).toEqual(
      createdAt,
    );
    expect(getMarketplaceNetRevenue(order)).toBe(46457);
  });

  it("allocates the net settlement and deducts actual product cost", () => {
    expect(getMarketplaceItemNetRevenue(order, order.items[0])).toBeCloseTo(
      33664.4927536,
    );
    expect(getMarketplaceItemNetRevenue(order, order.items[1])).toBeCloseTo(
      12792.5072464,
    );
    expect(getMarketplaceOrderNetProfit(order)).toBe(21457);
  });
});
