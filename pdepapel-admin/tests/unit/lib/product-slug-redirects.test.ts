import { describe, expect, it } from "vitest";

import { buildProductSlugRedirects, collapseProductRedirects } from "@/lib/product-slug-redirects";

describe("buildProductSlugRedirects", () => {
  it("exports safe aliases that do not collide with current product URLs", () => {
    expect(
      buildProductSlugRedirects(
        [
          {
            slug: "sello-lacre-amarillo-pastel-kawaii-s",
            product: { slug: "sello-lacre-amarillo-pastel" },
          },
          {
            slug: "another-product",
            product: { slug: "another-product" },
          },
          {
            slug: "current-product",
            product: { slug: "renamed-product" },
          },
          {
            slug: "unsafe_slug",
            product: { slug: "safe-product" },
          },
        ],
        ["current-product", "sello-lacre-amarillo-pastel"],
      ),
    ).toEqual([
      {
        source: "/producto/sello-lacre-amarillo-pastel-kawaii-s",
        destination: "/producto/sello-lacre-amarillo-pastel",
      },
    ]);
  });
});

/**
 * El mapa de redirecciones se congeló el 2026-08-24 y desde entonces algunos
 * destinos se renombraron (cadenas A→B→C) o se archivaron (404). Se rehace
 * contra el catálogo actual.
 */
describe("collapseProductRedirects", () => {
  const products = [
    { id: "p-verde", slug: "carpeta-van-gogh-verde", isArchived: false },
    { id: "p-owala", slug: "termo-owala-rojo", isArchived: true },
    { id: "p-vivo", slug: "block-iris-x35-hojas", isArchived: false },
    { id: "p-uuid", slug: "lapicero-halloween-2", isArchived: false },
  ];
  const aliases = [
    { slug: "carpeta-van-gogh", productId: "p-verde" },
    { slug: "termo-owala-rojo-aesthetic-l", productId: "p-owala" },
  ];

  it("collapses A→B→C into A→C", () => {
    const report = collapseProductRedirects({
      legacy: [{ source: "/producto/carpeta-van-gogh-van-gogh-amarillo-l", destination: "/producto/carpeta-van-gogh" }],
      aliases,
      products,
    });
    expect(report.redirects).toContainEqual({
      source: "/producto/carpeta-van-gogh-van-gogh-amarillo-l",
      destination: "/producto/carpeta-van-gogh-verde",
    });
    expect(report.collapsed).toHaveLength(1);
  });

  it("drops entries whose destination ends in an archived or missing product", () => {
    const report = collapseProductRedirects({
      legacy: [
        { source: "/producto/termo-owala-rojo-aesthetic-l", destination: "/producto/termo-owala-rojo" },
        { source: "/producto/papel-seda-verde-l", destination: "/producto/papel-seda-verde" },
      ],
      aliases,
      products,
    });
    expect(report.redirects.map((r) => r.source)).not.toContain("/producto/termo-owala-rojo-aesthetic-l");
    expect(report.dropped.map((d) => d.reason)).toEqual(["destino-archivado-o-inexistente", "destino-archivado-o-inexistente"]);
  });

  it("never redirects away from a live product URL", () => {
    const report = collapseProductRedirects({
      legacy: [{ source: "/producto/block-iris-x35-hojas", destination: "/producto/otro" }],
      aliases: [],
      products,
    });
    expect(report.redirects).toEqual([]);
    expect(report.dropped[0].reason).toBe("origen-es-producto-vivo");
  });

  it("adds current aliases and resolves id-based destinations to the slug", () => {
    const report = collapseProductRedirects({
      legacy: [{ source: "/producto/lapicero-halloween", destination: "/producto/p-uuid" }],
      aliases,
      products,
    });
    expect(report.redirects).toEqual([
      { source: "/producto/carpeta-van-gogh", destination: "/producto/carpeta-van-gogh-verde" },
      { source: "/producto/lapicero-halloween", destination: "/producto/lapicero-halloween-2" },
    ]);
    expect(report.added).toBe(1);
  });

  it("never leaves a destination that is itself a source", () => {
    const report = collapseProductRedirects({
      legacy: [
        { source: "/producto/a-vieja", destination: "/producto/carpeta-van-gogh" },
        { source: "/producto/b-vieja", destination: "/producto/a-vieja" },
      ],
      aliases: [...aliases, { slug: "a-vieja", productId: "p-verde" }, { slug: "b-vieja", productId: "p-verde" }],
      products,
    });
    const sources = new Set(report.redirects.map((r) => r.source));
    expect(report.redirects.every((r) => !sources.has(r.destination))).toBe(true);
    expect(new Set(report.redirects.map((r) => r.destination))).toEqual(new Set(["/producto/carpeta-van-gogh-verde"]));
  });
});
