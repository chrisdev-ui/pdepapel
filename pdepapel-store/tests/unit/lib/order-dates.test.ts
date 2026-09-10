import { describe, expect, it } from "vitest";

import { formatOrderDate } from "@/lib/order-dates";

describe("formatOrderDate", () => {
  // 2026-09-10T08:01:00Z is 03:01 in Bogotá (UTC-5), still the 10th.
  const iso = "2026-09-10T08:01:00.000Z";

  it("prints Bogotá time whatever the runtime timezone is", () => {
    expect(formatOrderDate(iso, "short")).toBe("10 sep, 03:01");
    expect(formatOrderDate(iso, "long")).toBe(
      "jueves 10 de septiembre de 2026, 03:01",
    );
  });

  it("keeps the Bogotá calendar day across the UTC midnight line", () => {
    // 2026-09-11T02:30Z is still 21:30 on the 10th in Bogotá.
    expect(formatOrderDate("2026-09-11T02:30:00.000Z", "day")).toBe(
      "10 de septiembre de 2026",
    );
  });

  it("accepts Date objects and renders nothing for bad input", () => {
    expect(formatOrderDate(new Date(iso), "day")).toBe("10 de septiembre de 2026");
    expect(formatOrderDate(null)).toBe("");
    expect(formatOrderDate("not a date")).toBe("");
  });
});
