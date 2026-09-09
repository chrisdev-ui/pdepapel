import { describe, expect, it } from "vitest";

import {
  PRICE_RANGE_BUCKETS,
  priceBucketWhere,
  typeFacetsFromCategories,
} from "@/lib/catalog-facets";

describe("catalog facets", () => {
  it("mirrors the storefront price presets", () => {
    expect(PRICE_RANGE_BUCKETS.map((bucket) => bucket.id)).toEqual([
      "[0,5000]",
      "[5000,10000]",
      "[10000,20000]",
      "[20000,50000]",
      "[50000,99999999]",
    ]);
    expect(priceBucketWhere(PRICE_RANGE_BUCKETS[1])).toEqual({ gte: 5000, lt: 10000 });
    expect(priceBucketWhere(PRICE_RANGE_BUCKETS[4])).toEqual({ gte: 50000 });
  });

  it("sums category counts into their types and ignores unknown categories", () => {
    const facets = typeFacetsFromCategories(
      [
        { id: "cat-a", count: 3 },
        { id: "cat-b", count: 4 },
        { id: "cat-c", count: 5 },
        { id: "ghost", count: 9 },
      ],
      [
        { id: "cat-a", typeId: "type-1" },
        { id: "cat-b", typeId: "type-1" },
        { id: "cat-c", typeId: "type-2" },
      ],
    );
    expect(facets).toEqual([
      { id: "type-1", count: 7 },
      { id: "type-2", count: 5 },
    ]);
  });
});
