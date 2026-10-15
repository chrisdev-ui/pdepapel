import { describe, expect, it } from "vitest";

import { calculateTotals } from "@/lib/utils";
import type { Product } from "@/types";

/** El recaudo contra entrega se suma al total en su propia línea, también con envío gratis. */
const items = [{ id: "a", price: "50000", quantity: 1 }] as unknown as Product[];

describe("totales con recaudo contra entrega", () => {
  it("envío cobrado: subtotal + envío + recaudo", () => {
    const totals = calculateTotals(items, null, 18000, null, 7000);
    expect(totals).toMatchObject({ shippingCost: 18000, codFee: 7000, total: 75000 });
  });

  it("envío gratis: el envío queda en 0 y el recaudo se cobra igual", () => {
    const totals = calculateTotals(items, null, 18000, 40000, 7000);
    expect(totals).toMatchObject({ freeShipping: true, shippingCost: 0, codFee: 7000, total: 57000 });
  });

  it("sin contra entrega nada cambia", () => {
    expect(calculateTotals(items, null, 18000, null).total).toBe(68000);
  });
});
