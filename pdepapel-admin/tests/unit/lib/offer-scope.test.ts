import { describe, expect, it } from "vitest";

import { describeOverlaps, overlapsFor, priceAfter } from "@/lib/offer-scope";

const offers = [
  { id: "o1", name: "Hasta agotar", type: "FIXED" as const, amount: 5000, productIds: ["p1"], categoryIds: [], productGroupIds: [] },
  { id: "o2", name: "Agendas -10", type: "PERCENTAGE" as const, amount: 10, productIds: [], categoryIds: ["c-agendas"], productGroupIds: [] },
  { id: "o3", name: "Hadas", type: "PERCENTAGE" as const, amount: 20, productIds: [], categoryIds: [], productGroupIds: ["g-hadas"] },
];

describe("priceAfter", () => {
  it("rounds like the storefront engine and never goes below zero", () => {
    expect(priceAfter("PERCENTAGE", 10, 23000)).toBe(20700);
    expect(priceAfter("PERCENTAGE", 15, 19900)).toBe(16915);
    expect(priceAfter("FIXED", 9000, 4000)).toBe(0);
    expect(priceAfter(undefined, undefined, 4000)).toBe(4000);
    expect(priceAfter("FIXED", 0, 4000)).toBe(4000);
  });
});

describe("overlapsFor", () => {
  it("finds offers by product, subcategory and group", () => {
    expect(overlapsFor(offers, { id: "p1", categoryId: "c-x", productGroupId: null }).map((o) => o.id)).toEqual(["o1"]);
    expect(overlapsFor(offers, { id: "p2", categoryId: "c-agendas", productGroupId: "g-hadas" }).map((o) => o.id)).toEqual(["o2", "o3"]);
    expect(overlapsFor(offers, { id: "p3", categoryId: "c-x", productGroupId: null })).toEqual([]);
  });

  it("describes each overlap with the price it leaves", () => {
    expect(describeOverlaps(offers, { id: "p2", categoryId: "c-agendas", productGroupId: null, price: 23000 })).toEqual([
      { offerId: "o2", name: "Agendas -10", type: "PERCENTAGE", amount: 10, after: 20700 },
    ]);
  });
});
