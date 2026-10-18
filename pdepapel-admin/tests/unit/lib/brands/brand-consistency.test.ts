import { describe, expect, it } from "vitest";

import { findGroupBrandMismatches, resolveProductBrandId } from "@/lib/brand-consistency";

describe("marca en un grupo", () => {
  it("un producto de un grupo lleva la marca del grupo, aunque pida otra", () => {
    expect(resolveProductBrandId({ requestedBrandId: "b", productGroupId: "g", groupBrandId: "a" })).toBe("a");
    expect(resolveProductBrandId({ requestedBrandId: "b", productGroupId: "g", groupBrandId: null })).toBeNull();
    expect(resolveProductBrandId({ requestedBrandId: "b", productGroupId: null, groupBrandId: null })).toBe("b");
  });

  it("encuentra las variantes con otra marca", () => {
    expect(
      findGroupBrandMismatches([
        { id: "g1", brandId: "a", products: [{ id: "p1", brandId: "a" }, { id: "p2", brandId: null }] },
        { id: "g2", brandId: null, products: [{ id: "p3", brandId: null }] },
      ]),
    ).toEqual([{ productGroupId: "g1", groupBrandId: "a", productIds: ["p2"] }]);
  });
});
