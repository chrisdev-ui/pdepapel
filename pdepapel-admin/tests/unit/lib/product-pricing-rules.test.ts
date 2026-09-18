import { describe, expect, it } from "vitest";

import { isPriceBelowCost, priceBelowCostMessage } from "@/lib/product-pricing-rules";

describe("isPriceBelowCost", () => {
  it("flags a sale price under the purchase cost and ignores products without cost", () => {
    expect(isPriceBelowCost(6500, 8000)).toBe(true);
    expect(isPriceBelowCost(8000, 8000)).toBe(false);
    expect(isPriceBelowCost(13000, 8000)).toBe(false);
    expect(isPriceBelowCost(13, 0)).toBe(false);
    expect(isPriceBelowCost(13, null)).toBe(false);
  });

  it("explains the loss per unit", () => {
    expect(priceBelowCostMessage(6500, 8000, (v) => `$ ${v}`)).toContain("perderías $ 1500 por unidad");
  });
});
