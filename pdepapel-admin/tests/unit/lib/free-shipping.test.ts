import { describe, expect, it } from "vitest";

import {
  getEffectiveShippingCost,
  qualifiesForFreeShipping,
} from "@/lib/order-totals";
import { parseFreeShippingThreshold } from "@/lib/store-settings";

describe("free shipping rule", () => {
  it("applies only when a positive threshold is reached by the product subtotal", () => {
    expect(qualifiesForFreeShipping(120000, 120000)).toBe(true);
    expect(qualifiesForFreeShipping(150000, 120000)).toBe(true);
    expect(qualifiesForFreeShipping(119999, 120000)).toBe(false);
    expect(qualifiesForFreeShipping(999999, null)).toBe(false);
    expect(qualifiesForFreeShipping(999999, undefined)).toBe(false);
    expect(qualifiesForFreeShipping(999999, 0)).toBe(false);
    expect(qualifiesForFreeShipping(999999, Number.NaN)).toBe(false);
  });

  it("zeroes the shipping cost when it applies and leaves it otherwise", () => {
    expect(getEffectiveShippingCost(130000, 15622, 120000)).toEqual({
      shippingCost: 0,
      freeShipping: true,
    });
    expect(getEffectiveShippingCost(80000, 15622, 120000)).toEqual({
      shippingCost: 15622,
      freeShipping: false,
    });
    expect(getEffectiveShippingCost(80000, 15622, null)).toEqual({
      shippingCost: 15622,
      freeShipping: false,
    });
  });
});

describe("parseFreeShippingThreshold", () => {
  it("accepts integers, formatted strings, and empty values", () => {
    expect(parseFreeShippingThreshold(120000)).toBe(120000);
    expect(parseFreeShippingThreshold("120000")).toBe(120000);
    expect(parseFreeShippingThreshold("120.000")).toBe(120000);
    expect(parseFreeShippingThreshold("")).toBeNull();
    expect(parseFreeShippingThreshold(null)).toBeNull();
    expect(parseFreeShippingThreshold(undefined)).toBeNull();
    expect(parseFreeShippingThreshold(0)).toBeNull();
  });

  it("rejects negatives, decimals, and text", () => {
    for (const value of [-1, 12.5, "abc", "12,5", true]) {
      expect(() => parseFreeShippingThreshold(value)).toThrow(
        /umbral de envío gratis/,
      );
    }
  });
});
