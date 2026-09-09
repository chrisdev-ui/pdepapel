import { describe, expect, it } from "vitest";

import { buildProductJsonLd, buildProductSchema } from "@/lib/product-schema";
import type { Product } from "@/types";

const base = {
  id: "p1",
  slug: "cuaderno-snoopy",
  name: "Cuaderno Snoopy",
  description: "<p>Cuaderno A5 argollado.</p>",
  price: "25000",
  stock: 4,
  sku: "CUA-SNO-A5",
  images: [{ id: "i1", url: "https://res.cloudinary.com/demo/a.jpg", isMain: true }],
  reviews: [],
} as unknown as Product;

describe("product structured data", () => {
  it("omits rating markup when the product has no reviews", () => {
    const schema = buildProductSchema(base) as Record<string, unknown>;
    expect(schema.aggregateRating).toBeUndefined();
    expect(schema.review).toBeUndefined();
    expect(schema.offers).toMatchObject({ price: 25000, priceCurrency: "COP", availability: "https://schema.org/InStock" });
  });

  it("adds aggregateRating and review entries only from real reviews", () => {
    const reviews = [
      { id: "r1", userId: "u1", name: "Laura", rating: 5, comment: "Hermoso", createdAt: "2026-09-01T00:00:00Z" },
      { id: "r2", userId: "u2", name: "Ana", rating: 4, comment: "Muy bueno" },
      { id: "r3", userId: "u3", name: "Bot", rating: 0, comment: "inválida" },
    ];
    const schema = buildProductSchema({ ...base, reviews } as Product) as Record<string, any>;
    expect(schema.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 });
    expect(schema.review).toHaveLength(2);
    expect(schema.review[0]).toMatchObject({ author: { name: "Laura" }, reviewRating: { ratingValue: 5 }, reviewBody: "Hermoso", datePublished: "2026-09-01T00:00:00Z" });
  });

  it("wraps distinct variants in a ProductGroup and falls back to a single Product otherwise", () => {
    const a = { ...base, id: "a", productGroupId: "g1", color: { id: "c1", name: "Rosa", value: "#f0f" } } as Product;
    const b = { ...base, id: "b", productGroupId: "g1", color: { id: "c2", name: "Azul", value: "#00f" } } as Product;
    expect(buildProductJsonLd(a, [a, b])).toMatchObject({ "@type": "ProductGroup", productGroupID: "g1" });
    expect(buildProductJsonLd(a, [a, { ...b, color: a.color }])).toMatchObject({ "@type": "Product" });
  });
});
