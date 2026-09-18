import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("keeps the order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 1, 3, 2, 4], 2, async (ms) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, ms));
      inFlight -= 1;
      return ms * 10;
    });
    expect(results).toEqual([50, 10, 30, 20, 40]);
    expect(peak).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
