import { describe, expect, it } from "vitest";

import { MERCADOLIBRE_FEE_RATE_ESTIMATE, MERCADOLIBRE_SHIPPING_ESTIMATE, suggestMercadoLibrePrice } from "@/lib/mercadolibre/listing-margin";
import { feeSourceFromQuote, mercadoLibreNetAt, saleFeeAt, suggestMercadoLibrePriceWithRule } from "@/lib/pricing/mercadolibre-fees";

/** Valores de prueba: ninguna cifra del negocio. */
const NO_RULE = { lowPriceFixedFee: null, freeShippingMin: null };
const RULE = { lowPriceFixedFee: 2000, freeShippingMin: 9000 };

describe("comisión de Mercado Libre", () => {
  it("por tipo de publicación: Clásica 16 %, Premium 19 %; un tipo desconocido cae en Clásica", () => {
    expect(saleFeeAt(10000, { kind: "tipo", listingType: "gold_special" })).toEqual({ amount: 1600, pct: 16, kind: "tipo", listingType: "gold_special" });
    expect(saleFeeAt(10000, { kind: "tipo", listingType: "gold_pro" })).toEqual({ amount: 1900, pct: 19, kind: "tipo", listingType: "gold_pro" });
    expect(saleFeeAt(10000, { kind: "tipo", listingType: null })).toMatchObject({ pct: 16, listingType: "gold_special" });
  });

  it("la real se lleva a otros precios con su porcentaje y su parte fija, no como una tasa promedio", () => {
    const source = feeSourceFromQuote({ percentageFee: 15, fixedFee: 300, listingTypeId: "gold_special" })!;
    expect(saleFeeAt(10000, source)).toEqual({ amount: 1800, pct: 15, kind: "real", listingType: "gold_special" });
    expect(saleFeeAt(20000, source).amount).toBe(3300);
    expect(feeSourceFromQuote({ percentageFee: null, fixedFee: 0, listingTypeId: "gold_pro" })).toBeNull();
    expect(feeSourceFromQuote(null)).toBeNull();
  });
});

describe("una sola regla para el neto", () => {
  const fee = { kind: "tipo", listingType: "gold_special" } as const;

  it("en el precio límite: cargo fijo y sin envío; un peso más: envío y sin cargo fijo", () => {
    expect(mercadoLibreNetAt({ price: 9000, unitCost: 1000, fee, rule: RULE })).toMatchObject({ fixedFee: 2000, shipping: 0 });
    expect(mercadoLibreNetAt({ price: 9001, unitCost: 1000, fee, rule: RULE })).toMatchObject({ fixedFee: 0, shipping: MERCADOLIBRE_SHIPPING_ESTIMATE });
  });

  it("el cargo fijo no pasa de la mitad del precio; el envío cotizado reemplaza al estimado por encima del límite", () => {
    expect(mercadoLibreNetAt({ price: 3000, unitCost: 500, fee, rule: RULE }).fixedFee).toBe(1500);
    expect(mercadoLibreNetAt({ price: 20000, unitCost: 1000, fee, rule: RULE, shippingCost: 6000 })).toMatchObject({ fixedFee: 0, shipping: 6000 });
  });
});

describe("precio sugerido con la regla", () => {
  const targets = { targetNet: 1000, targetMarginRate: 0.2 };

  it("sin los ajustes da exactamente lo mismo que la fórmula anterior (16 % y envío estimado)", () => {
    for (const unitCost of [500, 2000, 4500, 12000, 37000]) {
      const before = suggestMercadoLibrePrice({ unitCost, shippingCost: MERCADOLIBRE_SHIPPING_ESTIMATE, feeRate: MERCADOLIBRE_FEE_RATE_ESTIMATE, targetNet: targets.targetNet, targetMarginRate: targets.targetMarginRate });
      expect(suggestMercadoLibrePriceWithRule({ unitCost, fee: { kind: "tipo", listingType: "gold_special" }, rule: NO_RULE, targets })).toBe(before);
    }
  });

  it("con los ajustes puede quedarse por debajo del límite, donde no se paga envío, y cumple las metas", () => {
    const fee = { kind: "tipo", listingType: "gold_special" } as const;
    const price = suggestMercadoLibrePriceWithRule({ unitCost: 1500, fee, rule: RULE, targets })!;
    expect(price).toBeLessThanOrEqual(RULE.freeShippingMin);
    const net = mercadoLibreNetAt({ price, unitCost: 1500, fee, rule: RULE });
    expect(net.net!).toBeGreaterThanOrEqual(Math.max(targets.targetNet, targets.targetMarginRate * price));
    expect(mercadoLibreNetAt({ price: price - 1000, unitCost: 1500, fee, rule: RULE }).net!).toBeLessThan(Math.max(targets.targetNet, targets.targetMarginRate * (price - 1000)));
  });

  it("Premium pide un precio igual o mayor que Clásica; con metas imposibles no hay precio", () => {
    const special = suggestMercadoLibrePriceWithRule({ unitCost: 9000, fee: { kind: "tipo", listingType: "gold_special" }, rule: NO_RULE, targets })!;
    const pro = suggestMercadoLibrePriceWithRule({ unitCost: 9000, fee: { kind: "tipo", listingType: "gold_pro" }, rule: NO_RULE, targets })!;
    expect(pro).toBeGreaterThanOrEqual(special);
    expect(suggestMercadoLibrePriceWithRule({ unitCost: 9000, fee: { kind: "tipo", listingType: "gold_pro" }, rule: NO_RULE, targets: { targetNet: 0, targetMarginRate: 0.9 } })).toBeNull();
  });
});
