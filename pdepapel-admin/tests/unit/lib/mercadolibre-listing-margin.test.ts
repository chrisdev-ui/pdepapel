import { describe, expect, it } from "vitest";

import {
  getMercadoLibreMarginBreakdown,
  getMercadoLibreMarginWarning,
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
    expect(getMercadoLibreMarginWarning(thin, { breakevenPrice: 25_900, targetMarginRate: 0.2 })).toMatch(/por debajo del margen objetivo \(20 %\)/);
  });
});
