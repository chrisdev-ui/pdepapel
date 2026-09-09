import { describe, expect, it } from "vitest";

import { slimStoredProduct } from "@/lib/stored-product";
import { decodeSharedList, encodeSharedList } from "@/lib/shared-wishlist";
import type { Product } from "@/types";

const full = {
  id: "p1",
  name: "Cuaderno",
  price: "25000",
  stock: 3,
  quantity: 2,
  description: "<p>muy largo</p>".repeat(50),
  reviews: [{ id: "r1", rating: 5 }],
  kitComponents: [{ quantity: 1 }],
  images: [
    { id: "a", url: "https://x/a.jpg", isMain: false },
    { id: "b", url: "https://x/b.jpg", isMain: true },
  ],
  category: { id: "c", typeId: "t", name: "Cuadernos", slug: "cuadernos", seoIntro: "largo" },
} as unknown as Product;

describe("slimStoredProduct", () => {
  it("keeps what lists and checkout need and drops the heavy fields", () => {
    const slim = slimStoredProduct(full) as Record<string, unknown>;
    expect(slim.description).toBe("");
    expect(slim.reviews).toEqual([]);
    expect(slim.kitComponents).toBeUndefined();
    expect(slim.images).toEqual([{ id: "b", url: "https://x/b.jpg", isMain: true }]);
    expect(slim.category).toEqual({ id: "c", typeId: "t", name: "Cuadernos", slug: "cuadernos" });
    expect(slim).toMatchObject({ id: "p1", price: "25000", stock: 3, quantity: 2 });
  });
});

describe("shared favorites link", () => {
  it("round-trips product ids and ignores anything that is not an id", () => {
    const ids = ["5a2e2b1c-3c1e-4f1a-9d2e-1a2b3c4d5e6f", "6b3f3c2d-4d2f-4a2b-8e3f-2b3c4d5e6f7a"];
    const encoded = encodeSharedList([...ids, "<script>"]);
    expect(encoded).not.toContain("<");
    expect(decodeSharedList(encoded)).toEqual(ids);
    expect(decodeSharedList("no-es-base64!!")).toEqual([]);
    expect(decodeSharedList(undefined)).toEqual([]);
  });
});
