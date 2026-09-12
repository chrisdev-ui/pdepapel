import { describe, expect, it } from "vitest";

import { compareUrgency, computeReplenishment, describeCover, limitingKitComponent } from "@/lib/replenishment";

describe("computeReplenishment", () => {
  it("derives weekly rate, cover and a four-week suggestion", () => {
    const s = computeReplenishment({ stock: 1, sold30: 14, sold90: 30 });
    expect(s.weeklyRate).toBe(3.3);
    expect(s.coverDays).toBe(2);
    expect(s.suggested).toBe(Math.ceil((14 / 30) * 28 - 1)); // 13
    expect(s.needsReplenishment).toBe(true);
    expect(s.runsOutThisWeek).toBe(true);
    expect(s.dormant).toBe(false);
  });

  it("counts units on order as cover and subtracts them from the suggestion", () => {
    const s = computeReplenishment({ stock: 1, sold30: 14, sold90: 30, onOrder: 4 });
    expect(s.coverDaysWithOnOrder).toBe(10);
    expect(s.suggested).toBe(9);
  });

  it("flags an out-of-stock product that was selling, and a dormant one that was not", () => {
    expect(computeReplenishment({ stock: 0, sold30: 0, sold90: 5 })).toMatchObject({ outOfStockSelling: true, needsReplenishment: true, coverDays: null, suggested: 0 });
    expect(computeReplenishment({ stock: 2, sold30: 0, sold90: 0 })).toMatchObject({ dormant: true, needsReplenishment: false, runsOutThisWeek: false });
  });

  it("uses the store threshold as a fallback only for products that sell", () => {
    expect(computeReplenishment({ stock: 3, sold30: 1, sold90: 2, threshold: 5 }).needsReplenishment).toBe(true);
    expect(computeReplenishment({ stock: 3, sold30: 0, sold90: 0, threshold: 5 }).needsReplenishment).toBe(false);
    // Vende poco y tiene cobertura larga: no entra aunque el stock sea bajo si supera el umbral.
    expect(computeReplenishment({ stock: 6, sold30: 1, sold90: 2, threshold: 5 }).needsReplenishment).toBe(false);
  });
});

describe("compareUrgency", () => {
  it("puts selling out-of-stock first, then shortest cover, then dormant", () => {
    const rows = [
      { id: "dormant", stock: 2, signal: computeReplenishment({ stock: 2, sold30: 0, sold90: 0 }) },
      { id: "cover5", stock: 2, signal: computeReplenishment({ stock: 2, sold30: 12, sold90: 20 }) },
      { id: "out", stock: 0, signal: computeReplenishment({ stock: 0, sold30: 3, sold90: 6 }) },
      { id: "cover25", stock: 4, signal: computeReplenishment({ stock: 4, sold30: 4, sold90: 9 }) },
    ];
    expect(rows.sort(compareUrgency).map((r) => r.id)).toEqual(["out", "cover5", "cover25", "dormant"]);
  });
});

describe("describeCover", () => {
  it("labels the cover cell with the right tone", () => {
    expect(describeCover(computeReplenishment({ stock: 0, sold30: 2, sold90: 4 }), { lostOrders: 4 })).toEqual({ label: "Agotado · 4 pedidos perdidos", tone: "pink", percent: 0 });
    expect(describeCover(computeReplenishment({ stock: 1, sold30: 14, sold90: 20 }))).toMatchObject({ label: "2 días", tone: "pink" });
    expect(describeCover(computeReplenishment({ stock: 3, sold30: 8, sold90: 10 }), { limitingComponent: "el marcador lila" })).toMatchObject({ label: "11 días · limita el marcador lila", tone: "cream" });
    expect(describeCover(computeReplenishment({ stock: 4, sold30: 4, sold90: 9 }))).toMatchObject({ label: "30 días", tone: "mint" });
    expect(describeCover(computeReplenishment({ stock: 2, sold30: 0, sold90: 0 }))).toMatchObject({ label: "Sin ventas en 90 días", tone: "slate" });
  });
});

describe("limitingKitComponent", () => {
  it("names the component that allows the fewest kits", () => {
    expect(limitingKitComponent([{ name: "Marcador lila", quantity: 1, stock: 3 }, { name: "Marcador rosa", quantity: 1, stock: 9 }])).toEqual({ name: "Marcador lila", kits: 3 });
    expect(limitingKitComponent([])).toBeNull();
  });
});
