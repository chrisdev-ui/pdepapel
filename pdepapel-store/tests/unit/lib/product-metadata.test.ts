/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";

import {
  buildProductCanonicalUrl,
  buildProductMetaTitle,
  syncProductDocumentMetadata,
} from "@/lib/product-metadata";
import type { Product } from "@/types";

const product = (overrides: Partial<Product> = {}) =>
  ({
    id: "p1",
    slug: "llavero-osito-blanco",
    name: "Llavero Osito Blanco",
    design: { id: "d1", name: "Osito" },
    color: { id: "c1", name: "Blanco" },
    ...overrides,
  }) as unknown as Product;

describe("buildProductMetaTitle", () => {
  it("matches what the server renders: name then variant attributes", () => {
    expect(buildProductMetaTitle(product())).toBe(
      "Llavero Osito Blanco - Osito, Blanco",
    );
  });

  it("falls back to the bare name when there is nothing to distinguish", () => {
    expect(
      buildProductMetaTitle(product({ design: undefined, color: undefined })),
    ).toBe("Llavero Osito Blanco");
  });

  it("keeps only the attributes the product actually has", () => {
    expect(buildProductMetaTitle(product({ design: undefined }))).toBe(
      "Llavero Osito Blanco - Blanco",
    );
  });

  it("adds the customer-facing size when there is one", () => {
    const withSize = product({
      catalogOptionValues: [
        {
          option: { key: "tamano", displayOrder: 1 },
          optionValue: { name: "A5" },
        },
      ],
    } as unknown as Partial<Product>);
    expect(buildProductMetaTitle(withSize)).toBe(
      "Llavero Osito Blanco - Osito, Blanco, A5",
    );
  });

  it("ignores the internal shipping size, which is not for shoppers", () => {
    const shippingSize = product({
      size: { id: "s1", name: "M", value: "M" },
    } as unknown as Partial<Product>);
    expect(buildProductMetaTitle(shippingSize)).toBe(
      "Llavero Osito Blanco - Osito, Blanco",
    );
  });
});

describe("buildProductCanonicalUrl", () => {
  it("is absolute, like the tag the server writes", () => {
    expect(buildProductCanonicalUrl(product())).toBe(
      "https://papeleriapdepapel.com/producto/llavero-osito-blanco",
    );
  });

  it("falls back to the id when a product has no slug", () => {
    expect(buildProductCanonicalUrl(product({ slug: undefined }))).toBe(
      "https://papeleriapdepapel.com/producto/p1",
    );
  });
});

describe("syncProductDocumentMetadata", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>Viejo</title>
      <link rel="canonical" href="https://papeleriapdepapel.com/producto/viejo" />
      <meta property="og:title" content="Viejo" />
      <meta property="og:url" content="https://papeleriapdepapel.com/producto/viejo" />
      <meta name="twitter:title" content="Viejo" />
    `;
  });

  const head = () => ({
    title: document.title,
    canonical: document
      .querySelector('link[rel="canonical"]')
      ?.getAttribute("href"),
    ogTitle: document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content"),
    ogUrl: document
      .querySelector('meta[property="og:url"]')
      ?.getAttribute("content"),
    twitterTitle: document
      .querySelector('meta[name="twitter:title"]')
      ?.getAttribute("content"),
  });

  it("moves every title and url tag onto the variant being shown", () => {
    syncProductDocumentMetadata(product());

    expect(head()).toEqual({
      title: "Llavero Osito Blanco - Osito, Blanco",
      canonical: "https://papeleriapdepapel.com/producto/llavero-osito-blanco",
      ogTitle: "Llavero Osito Blanco - Osito, Blanco",
      ogUrl: "https://papeleriapdepapel.com/producto/llavero-osito-blanco",
      twitterTitle: "Llavero Osito Blanco - Osito, Blanco",
    });
  });

  it("tracks every switch, not just the first one", () => {
    syncProductDocumentMetadata(product());
    syncProductDocumentMetadata(
      product({
        slug: "llavero-perrito-negro",
        name: "Llavero Perrito Negro",
        design: { id: "d2", name: "Perrito" },
        color: { id: "c2", name: "Negro" },
      } as unknown as Partial<Product>),
    );
    syncProductDocumentMetadata(
      product({
        slug: "llavero-gorro-cafe",
        name: "Llavero Gorro Café",
        design: { id: "d3", name: "Gorro" },
        color: { id: "c3", name: "Café" },
      } as unknown as Partial<Product>),
    );

    expect(head()).toEqual({
      title: "Llavero Gorro Café - Gorro, Café",
      canonical: "https://papeleriapdepapel.com/producto/llavero-gorro-cafe",
      ogTitle: "Llavero Gorro Café - Gorro, Café",
      ogUrl: "https://papeleriapdepapel.com/producto/llavero-gorro-cafe",
      twitterTitle: "Llavero Gorro Café - Gorro, Café",
    });
  });

  it("does not blow up when a tag is missing from the head", () => {
    document.head.innerHTML = "<title>Solo el título</title>";

    expect(() => syncProductDocumentMetadata(product())).not.toThrow();
    expect(document.title).toBe("Llavero Osito Blanco - Osito, Blanco");
  });
});
