import { describe, expect, it } from "vitest";

import {
  evaluateListingPrice,
  getListingCostFloor,
  isPriceBelowCost,
  parsePriceOverride,
} from "@/lib/mercadolibre/listing-price-guard";

describe("Mercado Libre listing price guard", () => {
  it("uses the acquisition cost as the floor and ignores unknown or zero costs", () => {
    expect(getListingCostFloor({ acqPrice: 4000 })).toBe(4000);
    expect(getListingCostFloor({ acqPrice: 0 })).toBeNull();
    expect(getListingCostFloor({ acqPrice: null })).toBeNull();
    expect(getListingCostFloor({})).toBeNull();
    expect(isPriceBelowCost(3999, { acqPrice: 4000 })).toBe(true);
    expect(isPriceBelowCost(4000, { acqPrice: 4000 })).toBe(false);
    expect(isPriceBelowCost(1, { acqPrice: null })).toBe(false);
    // El envío y otros gastos por unidad suben el piso.
    expect(getListingCostFloor({ acqPrice: 4000, transportationCost: 1000 })).toBe(5000);
    expect(isPriceBelowCost(4500, { acqPrice: 4000, transportationCost: 1000 })).toBe(true);
    expect(isPriceBelowCost(5000, { acqPrice: 4000, transportationCost: 1000 })).toBe(false);
  });

  it("refuses a below-cost price without a written reason, naming both amounts", () => {
    const result = evaluateListingPrice({ price: 3500, product: { acqPrice: 4000 }, override: null });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refusal");
    expect(result.message).toContain("3.500");
    expect(result.message).toContain("4.000");
    expect(result.details).toMatchObject({ code: "MERCADOLIBRE_PRICE_BELOW_COST", floor: 4000, price: 3500 });
  });

  it("refuses a reason that is too short and accepts a real one, recording the authorization", () => {
    const short = evaluateListingPrice({ price: 3500, product: { acqPrice: 4000 }, override: { reason: "abc" } });
    expect(short.ok).toBe(false);
    const now = new Date("2026-09-11T10:00:00.000Z");
    const ok = evaluateListingPrice({
      price: 3500,
      product: { acqPrice: 4000 },
      override: { reason: "  liquidación de stock descontinuado " },
      now,
    });
    expect(ok).toEqual({
      ok: true,
      belowCost: true,
      floor: 4000,
      override: { reason: "liquidación de stock descontinuado", floor: 4000, price: 3500, at: now.toISOString() },
    });
  });

  it("does not keep an authorization once the price is at or above cost", () => {
    expect(
      evaluateListingPrice({ price: 4500, product: { acqPrice: 4000 }, override: { reason: "no hace falta" } }),
    ).toEqual({ ok: true, belowCost: false, floor: 4000, override: null });
  });

  it("parses the override from a request body", () => {
    expect(parsePriceOverride({ reason: " porque sí " })).toEqual({ reason: "porque sí" });
    expect(parsePriceOverride({ reason: "" })).toBeNull();
    expect(parsePriceOverride(undefined)).toBeNull();
    expect(parsePriceOverride("texto")).toBeNull();
  });
});
