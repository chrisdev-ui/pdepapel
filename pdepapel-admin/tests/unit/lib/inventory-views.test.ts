import { describe, expect, it } from "vitest";

import { describeLowStockThreshold, inventoryMatchesView, inventoryRowValue, normalizeInventoryView, summarizeInventory } from "@/lib/inventory-views";
import { computeReplenishment } from "@/lib/replenishment";

const rows = [
  { stock: 14, acqPrice: 18500, price: 32000 },
  { stock: 3, acqPrice: 600, price: 1100 },
  { stock: 0, acqPrice: 5000, price: 9000 },
  { stock: 8, acqPrice: null, price: 4000 },
  { stock: 99, acqPrice: 0, price: 12000, isKit: true },
];

describe("inventory views", () => {
  it("classifies rows into the work views", () => {
    expect(rows.map((r) => inventoryMatchesView(r, "por-reponer"))).toEqual([false, true, false, false, false]);
    expect(rows.map((r) => inventoryMatchesView(r, "agotados"))).toEqual([false, false, true, false, false]);
    expect(rows.map((r) => inventoryMatchesView(r, "sin-costo"))).toEqual([false, false, false, true, false]);
    expect(rows.map((r) => inventoryMatchesView(r, "kits"))).toEqual([false, false, false, false, true]);
  });

  it("moves the critical view with the store threshold and never counts the sold-out rows as critical", () => {
    expect(rows.map((r) => inventoryMatchesView(r, "por-reponer", 10))).toEqual([false, true, false, true, false]);
    expect(rows.map((r) => inventoryMatchesView(r, "por-reponer", 2))).toEqual([false, false, false, false, false]);
    expect(inventoryMatchesView({ stock: 0, price: 1 }, "por-reponer", 50)).toBe(false);
    expect(inventoryMatchesView({ stock: -1, price: 1 }, "agotados", 50)).toBe(true);
  });

  it("prefers the replenishment signal over the threshold when a row carries one", () => {
    // 20 al mes con 2 en stock: 3 días de cobertura, se acaba esta semana.
    const selling = { stock: 2, price: 1, signal: computeReplenishment({ stock: 2, sold30: 20, sold90: 40 }) };
    const dormant = { stock: 1, price: 1, signal: computeReplenishment({ stock: 1, sold30: 0, sold90: 0 }) };
    expect(inventoryMatchesView(selling, "por-reponer", 5)).toBe(true);
    expect(inventoryMatchesView(dormant, "por-reponer", 5)).toBe(false);
    const totals = summarizeInventory([selling, dormant, { stock: 0, price: 1, signal: computeReplenishment({ stock: 0, sold30: 1, sold90: 3 }) }]);
    expect(totals).toMatchObject({ lowStock: 2, runsOutThisWeek: 1, outOfStockSelling: 1, dormant: 1 });
    expect(normalizeInventoryView("stock-critico")).toBe("por-reponer");
    expect(normalizeInventoryView("agotados")).toBe("agotados");
    expect(normalizeInventoryView("nada")).toBeNull();
  });

  it("values stock at cost and at retail, ignoring kits", () => {
    expect(inventoryRowValue(rows[0])).toEqual({ cost: 259000, retail: 448000 });
    expect(inventoryRowValue(rows[3])).toEqual({ cost: 0, retail: 32000 });
    expect(inventoryRowValue(rows[4])).toEqual({ cost: 0, retail: 0 });
  });

  it("summarises totals and counts with the default threshold", () => {
    expect(summarizeInventory(rows)).toEqual({ products: 5, units: 25, costValue: 259000 + 1800, retailValue: 448000 + 3300 + 32000, lowStock: 1, outOfStock: 1, withoutCost: 1, runsOutThisWeek: 0, outOfStockSelling: 0, dormant: 0 });
  });

  it("summarises the critical count with the store threshold", () => {
    expect(summarizeInventory(rows, 10)).toMatchObject({ lowStock: 2, outOfStock: 1, withoutCost: 1 });
    expect(summarizeInventory(rows, 14)).toMatchObject({ lowStock: 3, outOfStock: 1 });
  });

  it("describes where the threshold comes from", () => {
    expect(describeLowStockThreshold(5, false)).toBe("5 unidades o menos · valor por defecto");
    expect(describeLowStockThreshold(12, true)).toBe("12 unidades o menos · según Ajustes");
    expect(describeLowStockThreshold(1, true)).toBe("1 unidad o menos · según Ajustes");
  });
});
