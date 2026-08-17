import { getCurrentSeason } from "@/lib/date-utils";
import { Season } from "@/types";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getCurrentSeason", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("activates the spooky theme from September 30th to November 3rd in Bogota", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T05:00:00.000Z"));
    expect(getCurrentSeason()).toBe(Season.Spooky);

    vi.setSystemTime(new Date("2026-11-04T04:59:59.000Z"));
    expect(getCurrentSeason()).toBe(Season.Spooky);

    vi.setSystemTime(new Date("2026-11-04T05:00:00.000Z"));
    expect(getCurrentSeason()).toBe(Season.Default);
  });

  it("preserves the Christmas window and the default season", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T05:00:00.000Z"));
    expect(getCurrentSeason()).toBe(Season.Christmas);

    vi.setSystemTime(new Date("2027-01-08T05:00:00.000Z"));
    expect(getCurrentSeason()).toBe(Season.Default);
  });
});
