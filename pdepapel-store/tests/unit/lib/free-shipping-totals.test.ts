import { describe, expect, it } from "vitest";

import { calculateTotals } from "@/lib/utils";
import type { Product } from "@/types";

const items = [
  { id: "a", price: "80000", quantity: 1 },
  { id: "b", price: "25000", quantity: 2 },
] as unknown as Product[];

describe("calculateTotals with a free-shipping threshold", () => {
  it("keeps paid shipping below the threshold and reports what is missing", () => {
    const totals = calculateTotals(items, null, 15622, 150000);

    expect(totals.subtotal).toBe(130000);
    expect(totals.freeShipping).toBe(false);
    expect(totals.shippingCost).toBe(15622);
    expect(totals.freeShippingRemaining).toBe(20000);
    expect(totals.total).toBe(145622);
  });

  it("zeroes shipping once the product subtotal reaches the threshold", () => {
    const totals = calculateTotals(items, null, 15622, 120000);

    expect(totals.freeShipping).toBe(true);
    expect(totals.shippingCost).toBe(0);
    expect(totals.freeShippingRemaining).toBe(0);
    expect(totals.total).toBe(130000);
  });

  it("ignores the rule when the store has no threshold", () => {
    expect(calculateTotals(items, null, 15622).total).toBe(145622);
    expect(calculateTotals(items, null, 15622, null).freeShipping).toBe(false);
    expect(calculateTotals(items, null, 15622, 0).freeShipping).toBe(false);
  });
});
