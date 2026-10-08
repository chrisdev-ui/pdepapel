import { describe, expect, it } from "vitest";

import {
  getMercadoLibreMarginBreakdown,
  getMercadoLibreMarginWarning,
  isLowPriceForMercadoLibre,
  roundToFriendlyPrice,
  suggestMercadoLibrePrice,
} from "@/lib/mercadolibre/listing-margin";

// Cifras reales de la auditoría #18 (2026-10-08): Clásica 16 %, envío obligatorio 8.100, retenciones ~1,5 %.
describe("Mercado Libre margin", () => {
  it("rounds up to a friendly price ending in 900", () => {
    expect(roundToFriendlyPrice(25_412)).toBe(25_900);
    expect(roundToFriendlyPrice(25_900)).toBe(25_900);
    expect(roundToFriendlyPrice(25_901)).toBe(26_900);
  });

  it("breaks the price down into fee, shipping, withholding estimate, net and margin", () => {
    const breakdown = getMercadoLibreMarginBreakdown({ price: 45_000, feeAmount: 7_200, shippingCost: 8_100, unitCost: 26_000 });
    expect(breakdown).toEqual({ price: 45_000, fee: 7_200, shipping: 8_100, withholding: 675, net: 3_025, marginRate: 3_025 / 45_000 });
  });

  it("without a unit cost there is no net to report", () => {
    expect(getMercadoLibreMarginBreakdown({ price: 45_000, feeAmount: 7_200, shippingCost: 8_100, unitCost: null }).net).toBeNull();
  });

  it("suggests the lowest friendly price that keeps the target net per unit", () => {
    // Cuaderno NORMA: costo 13.000; misma ganancia que en la tienda (12.000) → 40.900.
    const price = suggestMercadoLibrePrice({ unitCost: 13_000, shippingCost: 8_100, feeRate: 0.16, targetNet: 12_000 })!;
    expect(price).toBe(40_900);
    const at = getMercadoLibreMarginBreakdown({ price, feeAmount: price * 0.16, shippingCost: 8_100, unitCost: 13_000 });
    expect(at.net).toBeGreaterThanOrEqual(12_000);
    const below = getMercadoLibreMarginBreakdown({ price: price - 1_000, feeAmount: (price - 1_000) * 0.16, shippingCost: 8_100, unitCost: 13_000 });
    expect(below.net).toBeLessThan(12_000);
  });

  it("break-even is the suggestion for a zero target", () => {
    expect(suggestMercadoLibrePrice({ unitCost: 13_000, shippingCost: 8_100, feeRate: 0.16, targetNet: 0 })).toBe(25_900);
  });

  it("warns in plain Spanish below break-even, and below the target margin only when there is one", () => {
    const losing = getMercadoLibreMarginBreakdown({ price: 25_000, feeAmount: 4_000, shippingCost: 8_100, unitCost: 13_000 });
    expect(getMercadoLibreMarginWarning(losing, { breakevenPrice: 25_900 })).toBe(
      "Con este precio pierdes $ 475 por unidad después de la comisión, el envío y las retenciones estimadas. El mínimo para no perder es $ 25.900.",
    );
    const thin = getMercadoLibreMarginBreakdown({ price: 30_000, feeAmount: 4_800, shippingCost: 8_100, unitCost: 13_000 });
    expect(getMercadoLibreMarginWarning(thin, { breakevenPrice: 25_900 })).toBeNull();
    expect(getMercadoLibreMarginWarning(thin, { breakevenPrice: 25_900, targetMarginRate: 0.2, minNetPerUnit: 10_000 })).toBe(
      "Te quedan $ 3.650 por unidad (12.2 %), por debajo del objetivo de la tienda: al menos 20 % o $ 10.000 por unidad.",
    );
  });

  // Regla de Christian (2026-10-08): neto ≥ el mayor entre 20 % del precio y 10.000 COP.
  it("suggests the lowest friendly price meeting the larger of the % target and the minimum net", () => {
    const price = suggestMercadoLibrePrice({ unitCost: 13_000, shippingCost: 8_100, feeRate: 0.16, targetNet: 10_000, targetMarginRate: 0.2 })!;
    const net = (p: number) => getMercadoLibreMarginBreakdown({ price: p, feeAmount: p * 0.16, shippingCost: 8_100, unitCost: 13_000 }).net!;
    expect(net(price)).toBeGreaterThanOrEqual(Math.max(10_000, 0.2 * price));
    expect(net(price - 1_000)).toBeLessThan(Math.max(10_000, 0.2 * (price - 1_000)));
    // Aquí manda el mínimo de 10.000: con 20 % bastaría 33.900.
    expect(price).toBe(37_900);
  });

  it("an impossible margin target gives no suggestion", () => {
    expect(suggestMercadoLibrePrice({ unitCost: 13_000, shippingCost: 8_100, feeRate: 0.16, targetMarginRate: 0.9 })).toBeNull();
  });

  it("flags a product whose suggested price is far above the store price", () => {
    expect(isLowPriceForMercadoLibre(33_900, 15_000)).toBe(true);
    expect(isLowPriceForMercadoLibre(40_900, 25_000)).toBe(false);
  });
});
