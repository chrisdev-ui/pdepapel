import { describe, expect, it } from "vitest";

import { computeCardFacets, priceInRange, type FacetRow, type FacetSelection } from "@/lib/catalog-facets";

const row = (id: string, extra: Partial<FacetRow> = {}): FacetRow => ({
  id,
  productGroupId: null,
  categoryId: "a1",
  colorId: "rojo",
  sizeId: "s",
  designId: "liso",
  optionValues: [],
  effectivePrice: 6_000,
  hasDiscount: false,
  ...extra,
});
const none: FacetSelection = { colorIds: [], sizeIds: [], designIds: [], optionValuesByOption: new Map(), isOnSale: false };
const categories = [{ id: "a1", typeId: "A" }, { id: "b1", typeId: "B" }];
const count = (facets: { id: string; count: number }[] | undefined, id: string) => facets?.find((facet) => facet.id === id)?.count;

describe("computeCardFacets", () => {
  const group = ["g-s", "g-m", "g-l"].map((id, index) => row(id, { productGroupId: "G", sizeId: ["s", "m", "l"][index] }));

  it("un grupo de tres variantes del mismo color cuenta una tarjeta", () => {
    const facets = computeCardFacets([...group, row("suelto")], none, categories);
    expect(count(facets.colors, "rojo")).toBe(2);
    expect(count(facets.types, "A")).toBe(2);
    expect(count(facets.formattedSizes, "s")).toBe(2);
  });

  it("cada faceta aplica los demás filtros, no el suyo", () => {
    const rows = [...group, row("azul", { colorId: "azul", categoryId: "b1" })];
    const facets = computeCardFacets(rows, { ...none, colorIds: ["azul"] }, categories);
    expect(count(facets.colors, "rojo")).toBe(1);
    expect(count(facets.types, "A")).toBeUndefined();
    expect(count(facets.types, "B")).toBe(1);
  });

  it("los rangos de precio usan el precio con oferta y no se tocan en los bordes", () => {
    const rows = [row("oferta", { effectivePrice: 5_000, hasDiscount: true }), row("borde", { effectivePrice: 10_000 })];
    const facets = computeCardFacets(rows, none, categories);
    expect(count(facets.priceRanges, "[5000,10000]")).toBe(1);
    expect(count(facets.priceRanges, "[10000,20000]")).toBe(1);
    expect(count(facets.priceRanges, "[0,5000]")).toBe(0);
  });

  it("«Solo ofertas» cuenta solo filas con descuento", () => {
    const rows = [row("oferta", { hasDiscount: true }), row("normal", { colorId: "azul" })];
    const facets = computeCardFacets(rows, { ...none, isOnSale: true }, categories);
    expect(count(facets.colors, "rojo")).toBe(1);
    expect(count(facets.colors, "azul")).toBeUndefined();
  });

  it("un alcance de categoría vacío no deja nada", () => {
    const facets = computeCardFacets([row("x")], { ...none, categoryScope: [] }, categories);
    expect(facets.colors).toEqual([]);
  });
});

describe("priceInRange", () => {
  it("incluye el mínimo y excluye el máximo", () => {
    expect(priceInRange(5_000, 5_000, 10_000)).toBe(true);
    expect(priceInRange(10_000, 5_000, 10_000)).toBe(false);
    expect(priceInRange(10_000, 10_000)).toBe(true);
  });
});
