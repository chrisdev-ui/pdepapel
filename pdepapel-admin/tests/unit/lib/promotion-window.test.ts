import { describe, expect, it } from "vitest";

import {
  localDateToPromotionDay,
  normalizePromotionWindow,
  parsePromotionDay,
  promotionDayEnd,
  promotionDayStart,
  promotionDayToLocalDate,
  promotionWindowFilter,
} from "@/lib/promotion-window";

describe("promotion-window", () => {
  it("reads a calendar day from a day string, an instant or a Date (Bogotá)", () => {
    expect(parsePromotionDay("2026-09-30")).toBe("2026-09-30");
    // 02:00 UTC del 1 de octubre todavía es 30 de septiembre a las 21:00 en Bogotá.
    expect(parsePromotionDay("2026-10-01T02:00:00.000Z")).toBe("2026-09-30");
    expect(parsePromotionDay(new Date("2026-09-30T05:00:00.000Z"))).toBe("2026-09-30");
    expect(parsePromotionDay("no es fecha")).toBeNull();
    expect(parsePromotionDay("2026-13-40")).toBeNull();
    expect(parsePromotionDay(undefined)).toBeNull();
  });

  it("expands a day to its first and last instant in Colombia", () => {
    expect(promotionDayStart("2026-09-30").toISOString()).toBe("2026-09-30T05:00:00.000Z");
    expect(promotionDayEnd("2026-09-30").toISOString()).toBe("2026-10-01T04:59:59.999Z");
  });

  it("normalizes a window covering both days entirely", () => {
    const result = normalizePromotionWindow("2026-09-01", "2026-09-30");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.window.startDate.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(result.window.endDate.toISOString()).toBe("2026-10-01T04:59:59.999Z");
    // Un cupón «hasta el 30» sigue vigente a las 23:00 del 30 en Bogotá.
    const lateOn30th = new Date("2026-10-01T04:00:00.000Z");
    expect(lateOn30th >= result.window.startDate && lateOn30th <= result.window.endDate).toBe(true);
  });

  it("accepts a single-day window and rejects reversed or invalid ranges", () => {
    expect(normalizePromotionWindow("2026-09-10", "2026-09-10").ok).toBe(true);
    expect(normalizePromotionWindow("2026-09-11", "2026-09-10")).toEqual({
      ok: false,
      error: "La fecha de inicio no puede ser posterior a la de finalización",
    });
    expect(normalizePromotionWindow("", "2026-09-10")).toEqual({ ok: false, error: "La fecha de inicio no es válida" });
    expect(normalizePromotionWindow("2026-09-10", null)).toEqual({ ok: false, error: "La fecha de finalización no es válida" });
  });

  it("builds the shared Prisma filter and round-trips picker dates", () => {
    const now = new Date("2026-09-11T15:00:00.000Z");
    expect(promotionWindowFilter(now)).toEqual({ startDate: { lte: now }, endDate: { gte: now } });
    const local = promotionDayToLocalDate("2026-10-01T04:59:59.999Z");
    expect(localDateToPromotionDay(local)).toBe("2026-09-30");
  });
});
