import { describe, expect, it } from "vitest";

import { findGroupBrandMismatches, resolveProductBrandId } from "@/lib/brand-consistency";

describe("resolveProductBrandId", () => {
  it("a product in a group takes the group's brand, whatever the form sent", () => {
    expect(
      resolveProductBrandId({ requestedBrandId: "brand-b", productGroupId: "group-1", groupBrandId: "brand-a" }),
    ).toBe("brand-a");
  });

  it("a product in a group without brand stays without brand", () => {
    expect(
      resolveProductBrandId({ requestedBrandId: "brand-b", productGroupId: "group-1", groupBrandId: null }),
    ).toBeNull();
  });

  it("a standalone product keeps the brand it asked for, or none", () => {
    expect(resolveProductBrandId({ requestedBrandId: "brand-b", productGroupId: null, groupBrandId: "brand-a" })).toBe(
      "brand-b",
    );
    expect(resolveProductBrandId({ requestedBrandId: undefined, productGroupId: null, groupBrandId: null })).toBeNull();
  });
});

describe("findGroupBrandMismatches", () => {
  it("lists only the variants whose brand differs from their group", () => {
    expect(
      findGroupBrandMismatches([
        {
          id: "group-1",
          brandId: "brand-a",
          products: [
            { id: "p1", brandId: "brand-a" },
            { id: "p2", brandId: "brand-b" },
            { id: "p3", brandId: null },
          ],
        },
        { id: "group-2", brandId: null, products: [{ id: "p4", brandId: null }] },
      ]),
    ).toEqual([{ productGroupId: "group-1", groupBrandId: "brand-a", productIds: ["p2", "p3"] }]);
  });

  it("treats an unbranded group as consistent only when every variant is unbranded", () => {
    expect(
      findGroupBrandMismatches([{ id: "group-1", brandId: null, products: [{ id: "p1", brandId: "brand-a" }] }]),
    ).toEqual([{ productGroupId: "group-1", groupBrandId: null, productIds: ["p1"] }]);
  });
});
