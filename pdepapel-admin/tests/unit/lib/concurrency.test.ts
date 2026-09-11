import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("never runs more than the limit at once and keeps the order", async () => {
    let inFlight = 0;
    let peak = 0;
    const result = await mapWithConcurrency(
      [50, 10, 30, 5, 20, 1],
      2,
      async (delay, index) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, delay));
        inFlight -= 1;
        return `${index}:${delay}`;
      },
    );
    expect(peak).toBe(2);
    expect(result).toEqual(["0:50", "1:10", "2:30", "3:5", "4:20", "5:1"]);
  });

  it("handles an empty list and a limit below one", async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
    await expect(
      mapWithConcurrency([1, 2], 0, async (item) => item * 2),
    ).resolves.toEqual([2, 4]);
  });
});
