import { describe, expect, it } from "vitest";

import { planBrandInitialData, planFingerprint, type BrandInitialConfig, type PlanBrand } from "@/lib/brand-initial-data";
import { normalizeBrandName } from "@/lib/product-naming";

const config: BrandInitialConfig = {
  storeId: "store",
  brands: [
    { name: "Flower Power", parent: "Primavera", manufacturerName: "Papeles Primavera" },
    { name: "Incolors", parent: "Scribe", manufacturerName: "Scribe" },
    { name: "Scribe", manufacturerName: "Scribe" },
    { name: "Primavera", manufacturerName: "Papeles Primavera" },
    { name: "Klipp", aliases: ["Fashion"], isVisible: false },
  ],
  textMapping: {
    Primavera: { brand: "Primavera" },
    Klipp: { brand: "Klipp" },
    Fashion: { brand: "Klipp" },
    Shein: { none: true },
  },
};

const product = (
  id: string,
  name: string,
  extra: Partial<{ brand: string | null; brandId: string | null; isArchived: boolean; productGroupId: string | null }> = {},
) => ({ id, name, brand: null, brandId: null, isArchived: false, productGroupId: null, ...extra });

const brand = (id: string, name: string, extra: Partial<PlanBrand> = {}): PlanBrand => ({
  id,
  name,
  aliases: [],
  isArchived: false,
  isVisible: true,
  parentBrandId: null,
  ...extra,
});

const plan = (input: Partial<Parameters<typeof planBrandInitialData>[0]>) =>
  planBrandInitialData({ config, existingBrands: [], groups: [], products: [], normalize: normalizeBrandName, ...input });

describe("plan de datos iniciales de marcas", () => {
  it("crea las madres antes que sus líneas, con su visibilidad", () => {
    const result = plan({});
    expect(result.createBrands.map((row) => [row.name, row.parent, row.isVisible])).toEqual([
      ["Scribe", null, true],
      ["Primavera", null, true],
      ["Klipp", null, false],
      ["Flower Power", "Primavera", true],
      ["Incolors", "Scribe", true],
    ]);
    expect(result.createBrands.find((row) => row.name === "Klipp")?.aliases).toEqual(["Fashion"]);
  });

  it("por nombre gana la línea más específica; «Scribe» solo es Scribe", () => {
    const result = plan({
      products: [
        product("p1", "Colores Scribe Incolors x15"),
        product("p2", "Resaltadores Incolors"),
        product("p3", "Agenda Scribe"),
        product("p4", "Libreta Flower Power"),
        product("p5", "Block Primavera"),
      ],
    });
    expect(result.productAssignments).toEqual([
      { productId: "p1", brand: "Incolors", via: "nombre o alias" },
      { productId: "p2", brand: "Incolors", via: "nombre o alias" },
      { productId: "p3", brand: "Scribe", via: "nombre o alias" },
      { productId: "p4", brand: "Flower Power", via: "nombre o alias" },
      { productId: "p5", brand: "Primavera", via: "nombre o alias" },
    ]);
    expect(result.manualReview).toEqual([]);
  });

  it("una marca oculta solo entra por el texto anterior, nunca por el nombre", () => {
    const result = plan({
      products: [
        product("p1", "Morral Klipp"),
        product("p2", "Morral", { brand: "Klipp" }),
        product("p3", "Cartuchera", { brand: "FASHION" }),
        product("p4", "Gancho", { brand: "Shein" }),
        product("p5", "Taza", { brand: "Sunset" }),
      ],
    });
    expect(result.productAssignments).toEqual([
      { productId: "p2", brand: "Klipp", via: "texto anterior" },
      { productId: "p3", brand: "Klipp", via: "texto anterior" },
    ]);
    expect(result.manualReview).toEqual([{ kind: "product", id: "p5", reason: "texto anterior sin decisión: «Sunset»" }]);
  });

  it("texto de la madre y nombre de su línea: revisión manual con su propio motivo", () => {
    const result = plan({
      products: [product("p1", "Libreta Flower Power", { brand: "Primavera" }), product("p2", "Agenda Scribe", { brand: "Primavera" })],
    });
    expect(result.productAssignments).toEqual([]);
    expect(result.manualReview).toEqual([
      { kind: "product", id: "p1", reason: "el texto dice «Primavera» y el nombre dice su línea «Flower Power»" },
      { kind: "product", id: "p2", reason: "el texto dice «Primavera» y el nombre dice «Scribe»" },
    ]);
  });

  it("un grupo va entero a la línea que dice su nombre", () => {
    const result = plan({
      groups: [{ id: "g1", name: "Cuaderno Incolors", brand: null, brandId: null }],
      products: [
        product("v1", "Cuaderno Incolors rojo", { productGroupId: "g1" }),
        product("v2", "Cuaderno Incolors azul", { productGroupId: "g1", isArchived: true }),
      ],
    });
    expect(result.groupAssignments).toEqual([{ productGroupId: "g1", brand: "Incolors", via: "nombre o alias" }]);
    expect(result.productAssignments.map((row) => [row.productId, row.brand])).toEqual([
      ["v1", "Incolors"],
      ["v2", "Incolors"],
    ]);
  });

  it("es idempotente, y la huella cambia si cambia la madre de una línea", () => {
    const existing = [
      brand("b-scribe", "Scribe"),
      brand("b-incolors", "Incolors", { parentBrandId: "b-scribe" }),
      brand("b-primavera", "Primavera"),
      brand("b-flower", "Flower Power", { parentBrandId: "b-primavera" }),
      brand("b-klipp", "Klipp", { aliases: ["Fashion"], isVisible: false }),
    ];
    const result = plan({
      existingBrands: existing,
      products: [product("p1", "Colores Incolors", { brandId: "b-incolors" }), product("p2", "Agenda Scribe Incolors")],
    });
    expect(result.createBrands).toEqual([]);
    expect(result.productAssignments).toEqual([{ productId: "p2", brand: "Incolors", via: "nombre o alias" }]);

    const fresh = plan({});
    const moved = planBrandInitialData({
      config: { ...config, brands: config.brands.map((seed) => (seed.name === "Incolors" ? { ...seed, parent: "Primavera" } : seed)) },
      existingBrands: [],
      groups: [],
      products: [],
      normalize: normalizeBrandName,
    });
    expect(planFingerprint(moved)).not.toBe(planFingerprint(fresh));
  });

  it("rechaza una línea de una línea o de una marca que no existe", () => {
    expect(() =>
      planBrandInitialData({
        config: { ...config, brands: [...config.brands, { name: "Mini", parent: "Incolors" }] },
        existingBrands: [],
        groups: [],
        products: [],
        normalize: normalizeBrandName,
      }),
    ).toThrow(/ya es una línea/);
    expect(() =>
      planBrandInitialData({
        config: { ...config, brands: [{ name: "Suelta", parent: "Nadie" }] },
        existingBrands: [],
        groups: [],
        products: [],
        normalize: normalizeBrandName,
      }),
    ).toThrow(/no está en la lista/);
  });
});
