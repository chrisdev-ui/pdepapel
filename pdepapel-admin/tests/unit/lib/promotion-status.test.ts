import { describe, expect, it } from "vitest";

import { compareDiscounts, daysUntilEnd, formatDiscount, getPromotionStatus, isPromotionExhausted, summarizePromotions } from "@/lib/promotion-status";

const NOW = new Date("2026-09-08T15:00:00Z");

describe("promotion-status", () => {
  it("derives the status from the switch and the dates", () => {
    expect(getPromotionStatus({ isActive: true, startDate: "2026-09-01", endDate: "2026-09-30" }, NOW)).toBe("vigente");
    expect(getPromotionStatus({ isActive: true, startDate: "2026-10-01", endDate: "2026-10-30" }, NOW)).toBe("programada");
    expect(getPromotionStatus({ isActive: true, startDate: "2026-08-01", endDate: "2026-08-30" }, NOW)).toBe("vencida");
    expect(getPromotionStatus({ isActive: false, startDate: "2026-09-01", endDate: "2026-09-30" }, NOW)).toBe("desactivada");
    // El cron apaga las vencidas: siguen leyéndose como vencidas, no como apagadas a mano.
    expect(getPromotionStatus({ isActive: false, startDate: "2026-08-01", endDate: "2026-08-30" }, NOW)).toBe("vencida");
  });

  it("reads an exhausted coupon as agotada while it is still in dates, whatever the switch says", () => {
    const window = { startDate: "2026-09-01", endDate: "2026-09-30" };
    expect(getPromotionStatus({ ...window, isActive: true, maxUses: 1, usedCount: 1 }, NOW)).toBe("agotada");
    expect(getPromotionStatus({ ...window, isActive: false, maxUses: 50, usedCount: 50 }, NOW)).toBe("agotada");
    expect(getPromotionStatus({ ...window, isActive: true, maxUses: 50, usedCount: 49 }, NOW)).toBe("vigente");
    expect(getPromotionStatus({ ...window, isActive: true, maxUses: null, usedCount: 999 }, NOW)).toBe("vigente");
    // Vencida manda incluso sobre agotada.
    expect(getPromotionStatus({ isActive: true, startDate: "2026-08-01", endDate: "2026-08-30", maxUses: 1, usedCount: 1 }, NOW)).toBe("vencida");
    expect(isPromotionExhausted({ maxUses: 0, usedCount: 3 })).toBe(false);
  });

  it("summarizes a list of statuses", () => {
    expect(summarizePromotions(["vigente", "vigente", "programada", "agotada", "vencida", "desactivada"])).toEqual({
      total: 6,
      vigentes: 2,
      programadas: 1,
      agotadas: 1,
      vencidas: 1,
      desactivadas: 1,
    });
  });

  it("formats discounts and remaining days", () => {
    expect(formatDiscount("PERCENTAGE", 20, () => "x")).toBe("20 %");
    expect(formatDiscount("FIXED", 5000, (value) => `$ ${value}`)).toBe("$ 5000");
    expect(daysUntilEnd("2026-09-10T15:00:00Z", NOW)).toBe(2);
    expect(daysUntilEnd("2026-09-06T15:00:00Z", NOW)).toBe(-2);
  });

  it("sorts discounts by type first and then by amount", () => {
    const rows = [
      { type: "FIXED" as const, amount: 5000 },
      { type: "PERCENTAGE" as const, amount: 20 },
      { type: "FIXED" as const, amount: 500 },
      { type: "PERCENTAGE" as const, amount: 10 },
    ];
    expect([...rows].sort(compareDiscounts)).toEqual([
      { type: "PERCENTAGE", amount: 10 },
      { type: "PERCENTAGE", amount: 20 },
      { type: "FIXED", amount: 500 },
      { type: "FIXED", amount: 5000 },
    ]);
  });
});
