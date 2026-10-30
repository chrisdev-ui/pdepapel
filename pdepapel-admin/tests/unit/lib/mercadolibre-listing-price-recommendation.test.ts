import { describe, expect, it, vi } from "vitest";

import { recommendMercadoLibreListingPrice } from "@/lib/mercadolibre/listing-price-recommendation";

const NO_RULE = { lowPriceFixedFee: null, freeShippingMin: null };
const quote16 = async (price: number) => ({ saleFeeAmount: Math.round(price * 0.16), percentageFee: 16, fixedFee: 0, listingTypeId: "gold_special" });

describe("recommendMercadoLibreListingPrice (misma regla que el Copiloto y el asistente)", () => {
  it("el menor precio terminado en 900 que deja la ganancia después de comisión, envío y la retención del 1,7 %", async () => {
    const getFeeQuote = vi.fn(quote16);
    const recommendation = await recommendMercadoLibreListingPrice({ unitCost: 10_000, targetProfit: 6_000, initialPrice: 18_000, listingType: "gold_special", rule: NO_RULE, getFeeQuote });

    // 29.900 − 4.784 − 8.100 − 508 − 10.000 = 6.508; a 28.900 quedarían 5.685.
    expect(recommendation).toEqual({ price: 29_900, saleFeeAmount: 4_784, expectedProfit: 6_508 });
    // La comisión se vuelve a pedir al precio sugerido.
    expect(getFeeQuote).toHaveBeenLastCalledWith(29_900);
  });

  it("sin costo o sin ganancia objetivo no adivina ni consulta", async () => {
    const getFeeQuote = vi.fn(quote16);
    await expect(recommendMercadoLibreListingPrice({ unitCost: null, targetProfit: 6_000, initialPrice: 20_000, listingType: null, rule: NO_RULE, getFeeQuote })).resolves.toBeNull();
    await expect(recommendMercadoLibreListingPrice({ unitCost: 10_000, targetProfit: null, initialPrice: 20_000, listingType: null, rule: NO_RULE, getFeeQuote })).resolves.toBeNull();
    expect(getFeeQuote).not.toHaveBeenCalled();
  });

  it("hasta el precio límite cobra el cargo fijo en vez del envío", async () => {
    const base = { unitCost: 3_000, targetProfit: 2_000, initialPrice: 5_000, listingType: "gold_special", getFeeQuote: quote16 };
    // Sin los ajustes paga el envío: 16.900 (a 15.900 quedan 1.986). Con ellos: 9.900 − 1.584 − 2.700 − 168 − 3.000 = 2.448.
    expect((await recommendMercadoLibreListingPrice({ ...base, rule: NO_RULE }))?.price).toBe(16_900);
    expect(await recommendMercadoLibreListingPrice({ ...base, rule: { lowPriceFixedFee: 2_700, freeShippingMin: 10_000 } })).toEqual({ price: 9_900, saleFeeAmount: 1_584, expectedProfit: 2_448 });
  });

  it("el envío que paga la tienda reemplaza al estimado; si lo paga el comprador, no se descuenta", async () => {
    const base = { unitCost: 10_000, targetProfit: 6_000, initialPrice: 20_000, listingType: "gold_special", rule: NO_RULE, getFeeQuote: quote16 };
    const buyerPays = await recommendMercadoLibreListingPrice({ ...base, shippingCost: 0 });
    const sellerPays = await recommendMercadoLibreListingPrice({ ...base, shippingCost: 12_000 });
    expect(buyerPays!.price).toBeLessThan(sellerPays!.price);
    expect(sellerPays!.expectedProfit).toBeGreaterThanOrEqual(6_000);
  });

  it("Premium cobra más comisión: su precio sugerido es mayor", async () => {
    const quote19 = async (price: number) => ({ saleFeeAmount: Math.round(price * 0.19), percentageFee: 19, fixedFee: 0, listingTypeId: "gold_pro" });
    const base = { unitCost: 10_000, targetProfit: 6_000, initialPrice: 20_000, rule: NO_RULE };
    const classic = await recommendMercadoLibreListingPrice({ ...base, listingType: "gold_special", getFeeQuote: quote16 });
    const premium = await recommendMercadoLibreListingPrice({ ...base, listingType: "gold_pro", getFeeQuote: quote19 });
    expect(premium!.price).toBeGreaterThan(classic!.price);
  });

  it("el costo fijo de publicar también sale de la ganancia", async () => {
    const base = { unitCost: 10_000, targetProfit: 6_000, initialPrice: 20_000, listingType: "gold_special", rule: NO_RULE };
    const without = await recommendMercadoLibreListingPrice({ ...base, getFeeQuote: quote16 });
    const withListingFee = await recommendMercadoLibreListingPrice({ ...base, getFeeQuote: async (price) => ({ ...(await quote16(price)), listingFeeAmount: 3_000 }) });
    expect(withListingFee!.price).toBeGreaterThan(without!.price);
    expect(withListingFee!.expectedProfit).toBeGreaterThanOrEqual(6_000);
  });
});
