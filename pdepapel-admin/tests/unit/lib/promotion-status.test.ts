import { describe, expect, it } from "vitest";

import { daysUntilEnd, formatDiscount, getPromotionStatus, summarizePromotions } from "@/lib/promotion-status";

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

  it("summarizes a list of statuses", () => {
    expect(summarizePromotions(["vigente", "vigente", "programada", "vencida", "desactivada"])).toEqual({
      total: 5,
      vigentes: 2,
      programadas: 1,
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
});
