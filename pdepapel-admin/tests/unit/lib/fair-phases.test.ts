import { describe, expect, it } from "vitest";

import {
  FAIR_PHASES,
  fairMatchesView,
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
    expect(totals).toEqual({ allocated: 15, sold: 9, returned: 5, damaged: 1, lost: 0 });
    expect(soldShare(totals)).toBe(60);
    expect(soldShare({ allocated: 0, sold: 0 })).toBe(0);
    expect(soldShare({ allocated: 2, sold: 5 })).toBe(100);
  });

  it("suggests the next step per status", () => {
    expect(getFairNextStep({ status: "DRAFT", allocated: 0, sold: 0 })?.anchor).toBe("#inventario");
    expect(getFairNextStep({ status: "DRAFT", allocated: 3, sold: 0 })?.anchor).toBe("#capsulas");
    expect(getFairNextStep({ status: "OPEN", allocated: 3, sold: 0 })?.label).toContain("primera venta");
    expect(getFairNextStep({ status: "RECONCILING", allocated: 3, sold: 1 })?.anchor).toBe("#cierre");
    expect(getFairNextStep({ status: "CLOSED", allocated: 3, sold: 3 })).toBeNull();
  });
});
