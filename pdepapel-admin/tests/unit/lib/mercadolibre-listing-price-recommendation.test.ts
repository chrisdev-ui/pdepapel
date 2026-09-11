import { describe, expect, it, vi } from "vitest";

import { recommendMercadoLibreListingPrice } from "@/lib/mercadolibre/listing-price-recommendation";

describe("recommendMercadoLibreListingPrice", () => {
  it("suggests a price that preserves the target profit after the estimated fee", async () => {
    const recommendation = await recommendMercadoLibreListingPrice({
      acquisitionCost: 10_000,
      targetProfit: 6_000,
      initialPrice: 18_000,
      getFeeQuote: async (price) => ({
        saleFeeAmount: Math.ceil(price * 0.2) + 500,
        percentageFee: 20,
        fixedFee: 500,
      }),
    });

    expect(recommendation).not.toBeNull();
    expect(recommendation?.expectedProfit).toBeGreaterThanOrEqual(6_000);
    expect(recommendation?.price).toBeGreaterThan(18_000);
  });

  it("does not guess a price when cost or target profit are unavailable", async () => {
    const getFeeQuote = vi.fn(async () => ({ saleFeeAmount: 3_000 }));

    await expect(
      recommendMercadoLibreListingPrice({
        acquisitionCost: null,
        targetProfit: 6_000,
        initialPrice: 20_000,
        getFeeQuote,
      }),
    ).resolves.toBeNull();

    await expect(
      recommendMercadoLibreListingPrice({
        acquisitionCost: 10_000,
        targetProfit: null,
        initialPrice: 20_000,
        getFeeQuote,
      }),
    ).resolves.toBeNull();
    expect(getFeeQuote).not.toHaveBeenCalled();
  });

  it("includes seller-paid shipping in the target profit", async () => {
    const recommendation = await recommendMercadoLibreListingPrice({
      acquisitionCost: 10_000,
      targetProfit: 6_000,
      additionalCosts: 8_500,
      initialPrice: 20_000,
      getFeeQuote: async (price) => ({
        saleFeeAmount: Math.ceil(price * 0.2),
        percentageFee: 20,
      }),
    });

    expect(recommendation?.expectedProfit).toBeGreaterThanOrEqual(6_000);
    expect(recommendation?.price).toBeGreaterThan(30_000);
  });

  it("also covers a fixed listing fee when Mercado Libre charges one", async () => {
    const withoutListingFee = await recommendMercadoLibreListingPrice({
      acquisitionCost: 4_000,
      targetProfit: 6_000,
      initialPrice: 10_000,
      getFeeQuote: async (price) => ({ saleFeeAmount: Math.ceil(price * 0.13) + 3_000, percentageFee: 13, fixedFee: 3_000 }),
    });
    const withListingFee = await recommendMercadoLibreListingPrice({
      acquisitionCost: 4_000,
      targetProfit: 6_000,
      initialPrice: 10_000,
      getFeeQuote: async (price) => ({
        saleFeeAmount: Math.ceil(price * 0.13) + 3_000,
        percentageFee: 13,
        fixedFee: 3_000,
        listingFeeAmount: 2_000,
      }),
    });
    // Ejemplo del informe: costo 4.000, meta 6.000, 13 % + 3.000 → 14.943.
    expect(withoutListingFee?.price).toBe(14_943);
    expect(withoutListingFee?.expectedProfit).toBeGreaterThanOrEqual(6_000);
    expect(withListingFee?.price).toBeGreaterThan(withoutListingFee!.price);
    expect(withListingFee?.expectedProfit).toBeGreaterThanOrEqual(6_000);
  });
});
