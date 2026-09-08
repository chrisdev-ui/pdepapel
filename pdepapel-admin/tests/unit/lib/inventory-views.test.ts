import { describe, expect, it } from "vitest";

import { inventoryMatchesView, inventoryRowValue, summarizeInventory } from "@/lib/inventory-views";

const rows = [
  { stock: 14, acqPrice: 18500, price: 32000 },
  { stock: 3, acqPrice: 600, price: 1100 },
  { stock: 0, acqPrice: 5000, price: 9000 },
  { stock: 8, acqPrice: null, price: 4000 },
  { stock: 99, acqPrice: 0, price: 12000, isKit: true },
];

describe("inventory views", () => {
  it("classifies rows into the work views", () => {
    expect(rows.map((r) => inventoryMatchesView(r, "stock-critico"))).toEqual([false, true, false, false, false]);
    expect(rows.map((r) => inventoryMatchesView(r, "agotados"))).toEqual([false, false, true, false, false]);
    expect(rows.map((r) => inventoryMatchesView(r, "sin-costo"))).toEqual([false, false, false, true, false]);
    expect(rows.map((r) => inventoryMatchesView(r, "kits"))).toEqual([false, false, false, false, true]);
  });

  it("values stock at cost and at retail, ignoring kits", () => {
    expect(inventoryRowValue(rows[0])).toEqual({ cost: 259000, retail: 448000 });
    expect(inventoryRowValue(rows[3])).toEqual({ cost: 0, retail: 32000 });
    expect(inventoryRowValue(rows[4])).toEqual({ cost: 0, retail: 0 });
  });

  it("summarises totals and counts", () => {
    expect(summarizeInventory(rows)).toEqual({ products: 5, units: 25, costValue: 259000 + 1800, retailValue: 448000 + 3300 + 32000, lowStock: 1, outOfStock: 1, withoutCost: 1 });
  });
});
