import { describe, expect, it } from "vitest";

import {
  getBusinessGrowthPeriodDateBounds,
  getDefaultBusinessMovementDate,
  resolveBusinessGrowthPeriod,
} from "@/lib/business-growth-period";

const currentDate = new Date(2026, 8, 1, 12);

describe("business growth period selection", () => {
  it("uses the current Colombia month when no complete period is provided", () => {
    expect(resolveBusinessGrowthPeriod({}, currentDate)).toMatchObject({
      year: 2026,
      month: 9,
      monthIndex: 8,
      isCurrent: true,
    });

    expect(
      resolveBusinessGrowthPeriod({ year: "2025" }, currentDate),
    ).toMatchObject({ year: 2026, month: 9, isCurrent: true });
  });

  it("accepts a valid historical month and creates a stable reference date", () => {
    const period = resolveBusinessGrowthPeriod(
      { year: "2025", month: "8" },
      currentDate,
    );

    expect(period).toMatchObject({
      year: 2025,
      month: 8,
      monthIndex: 7,
      isCurrent: false,
    });
    expect(period.referenceDate.getFullYear()).toBe(2025);
    expect(period.referenceDate.getMonth()).toBe(7);
    expect(period.referenceDate.getDate()).toBe(15);
  });

  it("rejects future, malformed, and unsupported periods", () => {
    for (const values of [
      { year: "2026", month: "10" },
      { year: "2023", month: "12" },
      { year: "2025x", month: "8" },
      { year: "2025", month: "13" },
    ]) {
      expect(resolveBusinessGrowthPeriod(values, currentDate)).toMatchObject({
        year: 2026,
        month: 9,
        isCurrent: true,
      });
    }
  });

  it("constrains new movements to the selected month", () => {
    expect(
      getBusinessGrowthPeriodDateBounds({ year: 2024, month: 2 }),
    ).toEqual({ min: "2024-02-01", max: "2024-02-29" });
    expect(
      getDefaultBusinessMovementDate({
        year: 2025,
        month: 2,
        isCurrent: false,
      }),
    ).toBe("2025-02-28");
  });

  it("uses Colombia's calendar date for a current-period movement", () => {
    expect(
      getDefaultBusinessMovementDate(
        { year: 2026, month: 8, isCurrent: true },
        new Date("2026-09-01T02:00:00.000Z"),
      ),
    ).toBe("2026-08-31");
  });
});
