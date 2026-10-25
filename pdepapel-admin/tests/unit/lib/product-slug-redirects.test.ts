import { describe, expect, it } from "vitest";

import {
  archivedRedirectDestination,
  buildProductSlugRedirects,
  collapseProductRedirects,
  restoreArchivedSources,
} from "@/lib/product-slug-redirects";

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

/**
 * 2026-10-25: 27 orígenes del mapa terminaban en fichas archivadas (308 → 308)
 * y `collapseProductRedirects` los soltaba. Ningún origen se pierde: va en un
 * salto a donde lo mandaría la ficha archivada, con el aviso.
 */
describe("restoreArchivedSources", () => {
  const products = [
    { id: "p-live", slug: "agenda-viva", isArchived: false },
    { id: "p-archived", slug: "agenda-archivada", isArchived: true },
  ];
  const legacy = [
    { source: "/producto/agenda-vieja-m", destination: "/producto/agenda-archivada" },
    { source: "/producto/otra-vieja-s", destination: "/producto/agenda-viva" },
    { source: "/producto/agenda-viva", destination: "/producto/agenda-archivada" },
  ];

  it("arma el destino de la ficha archivada con el aviso", () => {
    expect(archivedRedirectDestination({ kind: "product", slug: "hermana" })).toBe("/producto/hermana#producto-no-disponible");
    expect(archivedRedirectDestination({ kind: "category", slug: "stickers" })).toBe("/categoria/stickers#producto-no-disponible");
    expect(archivedRedirectDestination({ kind: "type", id: "t 1" })).toBe("/tienda?typeId=t%201#producto-no-disponible");
    expect(archivedRedirectDestination({ kind: "shop" })).toBe("/tienda#producto-no-disponible");
  });

  it("devuelve al mapa el origen cuyo producto se archivó, sin tocar los vivos ni sombrear una ficha viva", () => {
    const report = collapseProductRedirects({ legacy, aliases: [], products });
    expect(report.dropped.map((entry) => entry.reason).sort()).toEqual(["destino-archivado-o-inexistente", "origen-es-producto-vivo"]);

    const restored = restoreArchivedSources(
      report,
      new Map([["/producto/agenda-vieja-m", { kind: "category", slug: "agendas" } as const]]),
    );
    expect(restored.redirects).toEqual([
      { source: "/producto/agenda-vieja-m", destination: "/categoria/agendas#producto-no-disponible" },
      { source: "/producto/otra-vieja-s", destination: "/producto/agenda-viva" },
    ]);
    expect(restored.restored).toBe(1);
    expect(restored.stillDropped).toEqual([expect.objectContaining({ reason: "origen-es-producto-vivo" })]);
  });

  it("es idempotente: una segunda corrida sobre su propio mapa no cambia ni suelta nada", () => {
    const first = restoreArchivedSources(
      collapseProductRedirects({ legacy, aliases: [], products }),
      new Map([["/producto/agenda-vieja-m", { kind: "category", slug: "agendas" } as const]]),
    ).redirects;
    const second = restoreArchivedSources(collapseProductRedirects({ legacy: first, aliases: [], products }), new Map());
    expect(second.redirects).toEqual(first);
    expect(second.stillDropped).toEqual([]);
  });

  it("una hermana viva elegida antes conserva el aviso en la siguiente corrida", () => {
    const report = collapseProductRedirects({
      legacy: [{ source: "/producto/agenda-vieja-m", destination: "/producto/agenda-viva#producto-no-disponible" }],
      aliases: [],
      products,
    });
    expect(report.redirects).toEqual([{ source: "/producto/agenda-vieja-m", destination: "/producto/agenda-viva#producto-no-disponible" }]);
    expect(report.kept).toBe(1);
  });

  it("sin destino conocido (nunca existió) el origen sigue fuera", () => {
    const report = collapseProductRedirects({ legacy: [legacy[0]], aliases: [], products });
    const restored = restoreArchivedSources(report, new Map([["/producto/agenda-vieja-m", null]]));
    expect(restored.redirects).toEqual([]);
    expect(restored.stillDropped).toHaveLength(1);
  });
});
