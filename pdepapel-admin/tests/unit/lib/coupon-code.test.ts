import { describe, expect, it } from "vitest";

import { normalizeCouponCode } from "@/lib/coupon-code";

describe("normalizeCouponCode", () => {
  it("accepts lowercase input while preserving the uppercase coupon invariant", () => {
    expect(normalizeCouponCode(" verano2026 ")).toBe("VERANO2026");
  });
});
