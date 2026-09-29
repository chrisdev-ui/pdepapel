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

  it("superpone la familia a un favorito guardado como grupo y deja la variante a los demás", () => {
    const products = [
      { id: "v-naranja", name: "Kit Básico de apuntes Girly Naranja", isGroup: false, productGroupId: "g1", slug: "kit-naranja" },
      { id: "s1", name: "Washi pastel", productGroupId: null },
    ] as unknown as Product[];
    const families = [
      { id: "v-azul", name: "Kits Básicos de apuntes", isGroup: true, productGroupId: "g1", variantCount: 4, slug: "kit-azul" },
    ] as unknown as Product[];
    const merged = mergeAccountProducts(
      [
        { productId: "v-naranja", savedPrice: 18000, savedAsGroup: true, createdAt: "2026-09-20T12:00:00Z" },
        { productId: "s1", savedPrice: null, createdAt: "2026-09-21T12:00:00Z" },
      ],
      products,
      [],
      families,
    );
    expect(merged[0]).toMatchObject({ id: "v-naranja", slug: "kit-naranja", name: "Kits Básicos de apuntes", isGroup: true, variantCount: 4, savedAsGroup: true, savedPrice: 18000 });
    expect(merged[1]).toMatchObject({ id: "s1", name: "Washi pastel", savedAsGroup: false });
  });
});
