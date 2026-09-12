import { describe, expect, it } from "vitest";

import { addKitDemand, compareUrgency, computeReplenishment, describeCover, describeRate, limitingKitComponent } from "@/lib/replenishment";

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
    // Agotado que vendió 5 en 90 días: el ritmo de 90 días sugiere qué pedir (5/90 × 28 ≈ 2).
    expect(computeReplenishment({ stock: 0, sold30: 0, sold90: 5 })).toMatchObject({ outOfStockSelling: true, needsReplenishment: true, coverDays: 0, suggested: 2, runsOutThisWeek: false });
    expect(computeReplenishment({ stock: 2, sold30: 0, sold90: 0 })).toMatchObject({ dormant: true, needsReplenishment: false, runsOutThisWeek: false });
  });

  it("uses the store threshold as a fallback only for products that sell", () => {
    expect(computeReplenishment({ stock: 3, sold30: 1, sold90: 2, threshold: 5 }).needsReplenishment).toBe(true);
    expect(computeReplenishment({ stock: 3, sold30: 0, sold90: 0, threshold: 5 }).needsReplenishment).toBe(false);
    // Vende poco y tiene cobertura larga: no entra aunque el stock sea bajo si supera el umbral.
    expect(computeReplenishment({ stock: 6, sold30: 1, sold90: 2, threshold: 5 }).needsReplenishment).toBe(false);
  });

  it("treats a product that sold in 90 days but not in 30 as selling, at the 90-day rate", () => {
    // Estacional: 18 en el trimestre, ninguno en el último mes, quedan 2 → 10 días de cobertura.
    const seasonal = computeReplenishment({ stock: 2, sold30: 0, sold90: 18 });
    expect(seasonal).toMatchObject({ rateWindowDays: 90, weeklyRate: 1.4, coverDays: 10, suggested: 4, needsReplenishment: true, runsOutThisWeek: false, dormant: false });
    expect(describeCover(seasonal)).toMatchObject({ label: "10 días · ritmo de 90 días", tone: "cream" });
    // Con menos de una semana de cobertura al ritmo de 90 días también «se acaba esta semana».
    expect(computeReplenishment({ stock: 1, sold30: 0, sold90: 18 }).runsOutThisWeek).toBe(true);
    // El umbral de unidades solo respalda lo que vendió en 30 días: vender 2 en el
    // trimestre con 3 en stock (135 días de cobertura) no es una compra de esta semana.
    expect(computeReplenishment({ stock: 3, sold30: 0, sold90: 2, threshold: 5 })).toMatchObject({ coverDays: 135, needsReplenishment: false });
    expect(computeReplenishment({ stock: 3, sold30: 2, sold90: 2, threshold: 5 }).needsReplenishment).toBe(true);
  });

  it("keeps «runs out this week» for products that still have stock; sold-out ones are «out of stock selling»", () => {
    expect(computeReplenishment({ stock: 0, sold30: 8, sold90: 16 })).toMatchObject({ outOfStockSelling: true, runsOutThisWeek: false, needsReplenishment: true });
    // 8 al mes con 1 en stock: 3 días de cobertura.
    expect(computeReplenishment({ stock: 1, sold30: 8, sold90: 16 })).toMatchObject({ outOfStockSelling: false, runsOutThisWeek: true, coverDays: 3 });
  });
});

describe("addKitDemand", () => {
  it("adds each kit's sales times the component quantity to the component, without touching the input", () => {
    const sold = new Map([["kit", 3], ["lila", 4], ["rosa", 0]]);
    const { total, viaKits } = addKitDemand(sold, [{ id: "kit", components: [{ componentId: "lila", quantity: 2 }, { componentId: "rosa", quantity: 1 }] }, { id: "other", components: [{ componentId: "lila", quantity: 5 }] }]);
    expect(total.get("lila")).toBe(10);
    expect(total.get("rosa")).toBe(3);
    expect(total.get("kit")).toBe(3);
    expect(viaKits.get("lila")).toBe(6);
    expect(viaKits.get("rosa")).toBe(3);
    expect(viaKits.has("kit")).toBe(false);
    expect(sold.get("lila")).toBe(4);
  });
});

describe("describeRate", () => {
  it("writes the same rate sentence for Inventario and the kardex", () => {
    expect(describeRate(computeReplenishment({ stock: 12, sold30: 6, sold90: 10 }))).toBe("1,4 por semana · 60 días de cobertura");
    expect(describeRate(computeReplenishment({ stock: 2, sold30: 0, sold90: 18 }))).toBe("1,4 por semana (ritmo de 90 días) · 10 días de cobertura");
    expect(describeRate(computeReplenishment({ stock: 2, sold30: 0, sold90: 0 }))).toBe("Sin ventas en 90 días");
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
    // Con stock y solo ventas en 90 días: cobertura larga medida con ese ritmo, y se dice.
    expect(describeCover(computeReplenishment({ stock: 3, sold30: 0, sold90: 3 }))).toMatchObject({ label: "90 días · ritmo de 90 días", tone: "mint" });
  });
});

describe("limitingKitComponent", () => {
  it("names the component that allows the fewest kits", () => {
    expect(limitingKitComponent([{ name: "Marcador lila", quantity: 1, stock: 3 }, { name: "Marcador rosa", quantity: 1, stock: 9 }])).toEqual({ name: "Marcador lila", kits: 3 });
    expect(limitingKitComponent([])).toBeNull();
  });
});
