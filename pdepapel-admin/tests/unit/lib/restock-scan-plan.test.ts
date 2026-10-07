import { describe, expect, it } from "vitest";

import { planRestockScan, planRestockScanUndo, type RestockDraftLine } from "@/lib/restock-orders";

const marcadores = { id: "p-mar", acqPrice: 21000 };
const line = (productId: string, quantity = 1, cost = 0): RestockDraftLine => ({ productId, quantity, cost });

describe("planRestockScan", () => {
  it("increment: suma una unidad a la línea que ya tiene el producto", () => {
    const plan = planRestockScan([line("otro"), line("p-mar", 2, 20000)], marcadores);
    expect(plan).toEqual({ effect: { kind: "increment", productId: "p-mar" }, index: 1, quantity: 3, cost: 20000 });
  });

  it("fill: llena la primera línea vacía y conserva un costo ya escrito", () => {
    expect(planRestockScan([line("otro"), line("", 1, 0), line("")], marcadores)).toEqual({
      effect: { kind: "fill", productId: "p-mar", previousCost: 0 },
      index: 1,
      quantity: 1,
      cost: 21000,
    });
    expect(planRestockScan([line("", 1, 18000)], marcadores).cost).toBe(18000);
  });

  it("add: abre una línea nueva con el costo del catálogo", () => {
    expect(planRestockScan([line("otro")], marcadores)).toEqual({
      effect: { kind: "add", productId: "p-mar" },
      index: 1,
      quantity: 1,
      cost: 21000,
    });
    expect(planRestockScan([], { id: "x", acqPrice: null }).cost).toBe(0);
  });
});

describe("planRestockScanUndo", () => {
  it("con más de una unidad quita solo la de esta lectura", () => {
    expect(planRestockScanUndo([line("p-mar", 3)], { kind: "increment", productId: "p-mar" })).toEqual({ type: "decrement", index: 0, quantity: 2 });
    expect(planRestockScanUndo([line("p-mar", 2)], { kind: "add", productId: "p-mar" })).toEqual({ type: "decrement", index: 0, quantity: 1 });
  });

  it("fill con una unidad deja la línea vacía con su costo de antes", () => {
    expect(planRestockScanUndo([line("p-mar", 1, 21000)], { kind: "fill", productId: "p-mar", previousCost: 0 })).toEqual({ type: "clear", index: 0, cost: 0 });
  });

  it("add con una unidad quita la línea", () => {
    expect(planRestockScanUndo([line("otro"), line("p-mar")], { kind: "add", productId: "p-mar" })).toEqual({ type: "remove", index: 1 });
  });

  it("no toca nada si la línea ya no está o la cantidad se bajó a mano", () => {
    expect(planRestockScanUndo([line("otro")], { kind: "add", productId: "p-mar" })).toEqual({ type: "none" });
    expect(planRestockScanUndo([line("p-mar", 1)], { kind: "increment", productId: "p-mar" })).toEqual({ type: "none" });
  });
});
