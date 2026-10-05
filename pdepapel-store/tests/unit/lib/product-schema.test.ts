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

  /**
   * `variesBy` era fijo (color, size, pattern) y Merchant exigía «size» a
   * variantes que no tienen talla: 101 fichas no válidas (2026-10-02). Ahora
   * solo se declara lo que cambia entre variantes.
   */
  describe("variesBy", () => {
    const rosa = { id: "c1", name: "Rosa", value: "#f0f" };
    const azul = { id: "c2", name: "Azul", value: "#00f" };
    const a5 = { id: "s1", name: "A5", value: "A5" };
    const a4 = { id: "s2", name: "A4", value: "A4" };
    const variant = (id: string, fields: Partial<Product>) =>
      ({ ...base, id, slug: `cuaderno-${id}`, productGroupId: "g1", ...fields }) as Product;
    const jsonLd = (variants: Product[]) =>
      buildProductJsonLd(variants[0], variants) as Record<string, any>;

    it("declares only color when the group varies by color", () => {
      const schema = jsonLd([
        variant("a", { color: rosa, size: a5 }),
        variant("b", { color: azul, size: a5 }),
      ]);
      expect(schema["@type"]).toBe("ProductGroup");
      expect(schema.variesBy).toEqual(["https://schema.org/color"]);
    });

    it("declares only size when the group varies by size", () => {
      const schema = jsonLd([
        variant("a", { color: rosa, size: a5 }),
        variant("b", { color: rosa, size: a4 }),
      ]);
      expect(schema["@type"]).toBe("ProductGroup");
      expect(schema.variesBy).toEqual(["https://schema.org/size"]);
      expect(schema.hasVariant.map((v: { size: string }) => v.size)).toEqual(["A5", "A4"]);
    });

    it("declares color and size when the group varies by both", () => {
      const schema = jsonLd([
        variant("a", { color: rosa, size: a5 }),
        variant("b", { color: azul, size: a5 }),
        variant("c", { color: rosa, size: a4 }),
      ]);
      expect(schema["@type"]).toBe("ProductGroup");
      expect(schema.variesBy).toEqual(["https://schema.org/color", "https://schema.org/size"]);
    });

    it("falls back to a single Product when the group varies by neither", () => {
      const schema = jsonLd([
        variant("a", { color: rosa, size: a5 }),
        variant("b", { color: rosa, size: a5 }),
      ]);
      expect(schema["@type"]).toBe("Product");
      expect(schema.variesBy).toBeUndefined();
    });

    it("declares only pattern for a design-only group with a shared colour (lapices-mafalda-x6)", () => {
      const multicolor = { id: "c3", name: "Multicolor", value: "#fff" };
      const schema = jsonLd([
        variant("a", { color: multicolor, design: { id: "d1", name: "Mafalda" } as Product["design"] }),
        variant("b", { color: multicolor, design: { id: "d2", name: "Snoopy" } as Product["design"] }),
      ]);
      expect(schema.variesBy).toEqual(["https://schema.org/pattern"]);
      expect(schema.hasVariant.every((v: Record<string, unknown>) => v.size === undefined)).toBe(true);
    });

    it("leaves out an attribute that some variant lacks, and falls back when nothing else tells them apart", () => {
      const partial = jsonLd([
        variant("a", { color: rosa, size: a5 }),
        variant("b", { color: azul, size: a4 }),
        variant("c", { color: rosa }),
      ]);
      expect(partial["@type"]).toBe("Product");

      const stillDistinct = jsonLd([
        variant("a", { color: rosa, size: a5 }),
        variant("b", { color: azul }),
      ]);
      expect(stillDistinct.variesBy).toEqual(["https://schema.org/color"]);
    });

    it("ignores internal shipping sizes, which never reach the markup", () => {
      const schema = jsonLd([
        variant("a", { color: rosa, size: { id: "s3", name: "S", value: "S" } }),
        variant("b", { color: rosa, size: { id: "s4", name: "M", value: "M" } }),
      ]);
      expect(schema["@type"]).toBe("Product");
    });
  });

  /** Google bajaba el original completo de cada foto del JSON-LD; ahora va la copia de 1600 px de la galería. */
  it("points structured-data images at the sized gallery copy", () => {
    const product = {
      ...base,
      images: [{ id: "i1", url: "https://res.cloudinary.com/demo/image/upload/v1/foto.jpg", isMain: true }],
    } as Product;
    expect(buildProductJsonLd(product, [product])).toMatchObject({
      image: ["https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_1600/v1/foto.jpg"],
    });
  });
});
