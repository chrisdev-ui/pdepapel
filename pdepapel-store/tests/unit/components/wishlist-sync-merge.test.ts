import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({}) }));
vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));

import { mergeAccountProducts } from "@/components/wishlist-sync-provider";
import type { Product } from "@/types";

describe("mergeAccountProducts", () => {
  it("uses the server saved date and price, and keeps a known date when the server has none", () => {
    const known = new Date("2026-07-01T12:00:00Z");
    const products = [{ id: "a", name: "A" }, { id: "b", name: "B" }] as Product[];
    const merged = mergeAccountProducts(
      [
        { productId: "b", savedPrice: 15000, createdAt: "2026-08-15T12:00:00Z" },
        { productId: "a", savedPrice: null, createdAt: "" },
        { productId: "missing", savedPrice: null, createdAt: "2026-08-15T12:00:00Z" },
      ],
      products,
      [{ id: "a", addedOn: known }],
    );
    expect(merged.map((item) => item.id)).toEqual(["b", "a"]);
    expect(merged[0].addedOn).toEqual(new Date("2026-08-15T12:00:00Z"));
    expect(merged[0].savedPrice).toBe(15000);
    expect(merged[1].addedOn).toEqual(known);
    expect(merged[1].savedPrice).toBeNull();
  });
});
