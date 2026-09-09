import { describe, expect, it } from "vitest";

import {
  availableAtToInput,
  isComingSoon,
  parseAvailableAt,
  parseProductAvailability,
  productAvailabilityWhere,
} from "@/lib/product-availability";

const NOW = new Date("2026-09-09T15:00:00.000Z");

describe("product availability", () => {
  it("treats a future availableAt as coming soon", () => {
    expect(isComingSoon({ availableAt: null }, NOW)).toBe(false);
    expect(isComingSoon({ availableAt: "2026-09-01T05:00:00.000Z" }, NOW)).toBe(false);
    expect(isComingSoon({ availableAt: "2026-10-01T05:00:00.000Z" }, NOW)).toBe(true);
  });

  it("parses form dates as Bogotá midnight and clears empty values", () => {
    expect(parseAvailableAt("2026-10-01")?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(parseAvailableAt("")).toBeNull();
    expect(parseAvailableAt(null)).toBeNull();
    expect(() => parseAvailableAt("mañana")).toThrow("no es válida");
    expect(availableAtToInput("2026-10-01T05:00:00.000Z")).toBe("2026-10-01");
  });

  it("defaults listings to available products only", () => {
    expect(parseProductAvailability(null)).toBe("available");
    expect(parseProductAvailability("coming-soon")).toBe("coming-soon");
    expect(productAvailabilityWhere("available", NOW)).toEqual({ OR: [{ availableAt: null }, { availableAt: { lte: NOW } }] });
    expect(productAvailabilityWhere("coming-soon", NOW)).toEqual({ availableAt: { gt: NOW } });
    expect(productAvailabilityWhere("all", NOW)).toEqual({});
  });
});
