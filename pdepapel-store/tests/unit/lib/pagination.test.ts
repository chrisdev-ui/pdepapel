import { describe, expect, it } from "vitest";

import { DOTS } from "@/constants";
import { getPaginationPages } from "@/lib/pagination";

describe("getPaginationPages", () => {
  it("shows every page when the result set is short", () => {
    expect(getPaginationPages(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("always keeps the first page reachable near the start", () => {
    expect(getPaginationPages(3, 12)).toEqual([1, 2, 3, DOTS, 12]);
  });

  it("keeps the current page and both ends reachable in the middle", () => {
    expect(getPaginationPages(6, 12)).toEqual([1, DOTS, 6, DOTS, 12]);
  });

  it("keeps the final pages reachable near the end", () => {
    expect(getPaginationPages(11, 12)).toEqual([1, DOTS, 10, 11, 12]);
  });
});
