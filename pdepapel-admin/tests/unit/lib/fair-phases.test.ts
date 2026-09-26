import { describe, expect, it } from "vitest";

import {
  FAIR_PHASES,
  canCancelFairSale,
  canSellInFair,
  fairMatchesView,
  getReconciliationRowState,
  fairRowUnitSize,
  summarizeReconciliation,
  getFairNextStep,
  getFairPhase,
  getPhaseIndex,
  soldShare,
  summarizeFairInventory,
} from "@/lib/fair-phases";

describe("fair-phases", () => {
  it("maps statuses to phases in order", () => {
    expect(getFairPhase("DRAFT")).toBe("preparar");
    expect(getFairPhase("OPEN")).toBe("vender");
    expect(getFairPhase("RECONCILING")).toBe("conciliar");
    expect(getFairPhase("CLOSED")).toBe("cerrada");
    expect(getFairPhase("CANCELLED")).toBeNull();
    expect(getPhaseIndex("conciliar")).toBe(2);
    expect(getPhaseIndex(null)).toBe(-1);
    expect(FAIR_PHASES.map((phase) => phase.id)).toEqual(["preparar", "vender", "conciliar", "cerrada"]);
  });

  it("groups fairs into list views", () => {
    expect(fairMatchesView("DRAFT", "activas")).toBe(true);
    expect(fairMatchesView("OPEN", "activas")).toBe(true);
    expect(fairMatchesView("CLOSED", "activas")).toBe(false);
    expect(fairMatchesView("CANCELLED", "cerradas")).toBe(true);
    expect(fairMatchesView("OPEN", "todas")).toBe(true);
  });

  it("sums fair inventory and computes the sold share", () => {
    const totals = summarizeFairInventory([
      { allocatedQuantity: 10, soldQuantity: 4, returnedQuantity: 5, damagedQuantity: 1 },
      { allocatedQuantity: 5, soldQuantity: 5 },
    ]);
    expect(totals).toEqual({ allocated: 15, sold: 9, allocatedUnits: 15, returned: 5, damaged: 1, lost: 0 });
    expect(soldShare(totals)).toBe(60);
    expect(soldShare({ allocated: 0, sold: 0 })).toBe(0);
    expect(soldShare({ allocated: 2, sold: 5 })).toBe(100);
  });

  it("suggests the next step per status", () => {
    expect(getFairNextStep({ status: "DRAFT", allocated: 0, sold: 0 })?.anchor).toBe("#inventario");
    expect(getFairNextStep({ status: "DRAFT", allocated: 3, sold: 0 })?.anchor).toBe("#capsulas");
    expect(getFairNextStep({ status: "OPEN", allocated: 3, sold: 0 })?.label).toContain("primera venta");
    expect(getFairNextStep({ status: "OPEN", allocated: 3, sold: 2 })?.anchor).toBe("#cierre");
    expect(getFairNextStep({ status: "RECONCILING", allocated: 3, sold: 1 })?.anchor).toBe("#cierre");
    expect(getFairNextStep({ status: "CLOSED", allocated: 3, sold: 3 })).toBeNull();
  });

  it("only sells while open and only cancels sales before the close", () => {
    expect(canSellInFair("OPEN")).toBe(true);
    expect(canSellInFair("RECONCILING")).toBe(false);
    expect(canCancelFairSale("OPEN")).toBe(true);
    expect(canCancelFairSale("RECONCILING")).toBe(true);
    expect(canCancelFairSale("CLOSED")).toBe(false);
  });

  it("labels each reconciliation row as balanced, untouched, missing, over or sold out", () => {
    const item = { allocatedQuantity: 10, soldQuantity: 7 };
    expect(getReconciliationRowState(item, { returnedQuantity: 2, damagedQuantity: 1, lostQuantity: 0 })).toMatchObject({ status: "balanced", label: "Cuadra", expected: 3, delta: 0 });
    expect(getReconciliationRowState(item, { returnedQuantity: 1, damagedQuantity: 0, lostQuantity: 0 })).toMatchObject({ status: "missing", label: "Faltan 2" });
    expect(getReconciliationRowState(item, { returnedQuantity: 4, damagedQuantity: 0, lostQuantity: 0 })).toMatchObject({ status: "over", label: "Sobran 1" });
    // Sin contar nada es «untouched», no «missing»: el rediseño de la
    // conciliación distingue «no la he contado» de «conté de menos», para que
    // un formulario sin tocar no parezca una cuenta hecha.
    expect(getReconciliationRowState(item, undefined)).toMatchObject({ status: "untouched", label: "Sin contar" });
    expect(getReconciliationRowState(item, { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 })).toMatchObject({ status: "untouched", label: "Sin contar" });
    expect(getReconciliationRowState({ allocatedQuantity: 4, soldQuantity: 4 }, { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 })).toMatchObject({ status: "sold-out", label: "Todo vendido" });
  });

  it("sums the count and knows when every row balances", () => {
    const items = [
      { productId: "a", allocatedQuantity: 10, soldQuantity: 7 },
      { productId: "b", allocatedQuantity: 5, soldQuantity: 5 },
      { productId: "c", allocatedQuantity: 6, soldQuantity: 1 },
    ];
    const partial = summarizeReconciliation(items, {
      a: { returnedQuantity: 2, damagedQuantity: 1, lostQuantity: 0 },
      c: { returnedQuantity: 1, damagedQuantity: 0, lostQuantity: 0 },
    });
    expect(partial).toEqual({ returned: 3, damaged: 1, lost: 0, unbalanced: 1, untouched: 0, pending: 4, balanced: false });
    const full = summarizeReconciliation(items, {
      a: { returnedQuantity: 2, damagedQuantity: 1, lostQuantity: 0 },
      b: { returnedQuantity: 0, damagedQuantity: 0, lostQuantity: 0 },
      c: { returnedQuantity: 3, damagedQuantity: 0, lostQuantity: 2 },
    });
    expect(full).toEqual({ returned: 5, damaged: 1, lost: 2, unbalanced: 0, untouched: 0, pending: 0, balanced: true });
  });
});

describe("kit rows count pieces where stock moves", () => {
  const kitRow = {
    productId: "kit",
    allocatedQuantity: 2,
    soldQuantity: 1,
    returnedQuantity: 1,
    damagedQuantity: 0,
    lostQuantity: 0,
    kitComponents: [{ quantityPerKit: 1 }, { quantityPerKit: 2 }],
  };
  const looseRow = { productId: "p", allocatedQuantity: 4, soldQuantity: 1, returnedQuantity: 2, damagedQuantity: 1, lostQuantity: 0 };

  it("sizes a loose row as 1 and a kit row as the sum of its pieces", () => {
    expect(fairRowUnitSize(looseRow)).toBe(1);
    expect(fairRowUnitSize(kitRow)).toBe(3);
    expect(fairRowUnitSize({ kitComponents: [] })).toBe(1);
  });

  it("keeps reserved and sold in kits but returns, damage, loss and the kardex outflow in pieces", () => {
    expect(summarizeFairInventory([kitRow, looseRow])).toEqual({
      allocated: 6,
      sold: 2,
      allocatedUnits: 2 * 3 + 4,
      returned: 1 * 3 + 2,
      damaged: 1,
      lost: 0,
    });
  });

  it("tells the close dialog how many pieces come back, while pending stays in kits", () => {
    const summary = summarizeReconciliation([kitRow, looseRow], {
      kit: { returnedQuantity: 1, damagedQuantity: 0, lostQuantity: 0 },
      p: { returnedQuantity: 1, damagedQuantity: 0, lostQuantity: 0 },
    });
    expect(summary).toMatchObject({ returned: 3 + 1, damaged: 0, lost: 0, pending: 2, unbalanced: 1, balanced: false });
  });
});
