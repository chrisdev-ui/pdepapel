import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({}) }));
vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));

import { mergeAccountProducts } from "@/components/wishlist-sync-provider";
import type { Product } from "@/types";

describe("mergeAccountProducts", () => {
  it("keeps the date a product was saved instead of stamping today on every sign-in", () => {
    const addedOn = new Date("2026-07-01T12:00:00Z");
    const products = [{ id: "a", name: "A" }, { id: "b", name: "B" }] as Product[];
    const merged = mergeAccountProducts(["b", "a", "missing"], products, [{ id: "a", addedOn }]);
    expect(merged.map((item) => item.id)).toEqual(["b", "a"]);
    expect(merged[1].addedOn).toEqual(addedOn);
    expect(merged[0].addedOn).toBeInstanceOf(Date);
  });
});
