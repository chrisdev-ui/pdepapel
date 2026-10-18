import { describe, expect, it } from "vitest";

import { planBrandInitialData, planFingerprint, type BrandInitialConfig } from "@/lib/brand-initial-data";
import { normalizeBrandName } from "@/lib/product-naming";

const config: BrandInitialConfig = {
  storeId: "store",
  brands: [
    { name: "Marca Uno" },
    { name: "Scribe", manufacturerName: "Scribe", aliases: ["Incolors"] },
  ],
  textMapping: { "Marca Uno": { brand: "Marca Uno" }, Otra: { none: true } },
};

const product = (id: string, name: string, extra: Partial<{ brand: string | null; brandId: string | null; isArchived: boolean; productGroupId: string | null }> = {}) => ({
  id,
  name,
  brand: null,
  brandId: null,
  isArchived: false,
  productGroupId: null,
  ...extra,
});

describe("plan de datos iniciales de marcas", () => {
  it("crea las marcas que faltan y asigna por texto anterior y por nombre o alias", () => {
    const plan = planBrandInitialData({
      config,
      existingBrands: [],
      normalize: normalizeBrandName,
      groups: [],
      products: [
        product("p1", "Cuaderno", { brand: "MARCA UNO" }),
        product("p2", "Colores Incolors x15"),
        product("p3", "Libreta lisa"),
        product("p4", "Agenda", { brand: "Otra" }),
        product("p5", "Agenda Scribe", { brand: "Marca rara" }),
        product("p6", "Cuaderno Incolors", { isArchived: true }),
      ],
    });
    expect(plan.createBrands.map((brand) => [brand.name, brand.slug])).toEqual([
      ["Marca Uno", "marca-uno"],
      ["Scribe", "scribe"],
    ]);
    expect(plan.productAssignments).toEqual([
      { productId: "p1", brand: "Marca Uno", via: "texto anterior" },
      { productId: "p2", brand: "Scribe", via: "nombre o alias" },
    ]);
    expect(plan.manualReview).toEqual([
      { kind: "product", id: "p5", reason: "texto anterior sin decisión: «Marca Rara»" },
    ]);
    expect(plan.rows).toBe(4);
  });

  it("asigna un grupo entero y marca conflictos para revisión manual", () => {
    const plan = planBrandInitialData({
      config,
      existingBrands: [{ id: "b1", name: "Marca Uno", aliases: [], isArchived: false }],
      normalize: normalizeBrandName,
      groups: [
        { id: "g1", name: "Cuaderno Incolors", brand: null, brandId: null },
        { id: "g2", name: "Agenda Scribe", brand: "Marca Uno", brandId: null },
      ],
      products: [
        product("v1", "Cuaderno Incolors rojo", { productGroupId: "g1" }),
        product("v2", "Cuaderno Incolors azul", { productGroupId: "g1", isArchived: true }),
        product("v3", "Agenda Scribe roja", { productGroupId: "g2" }),
      ],
    });
    expect(plan.createBrands.map((brand) => brand.name)).toEqual(["Scribe"]);
    expect(plan.groupAssignments).toEqual([{ productGroupId: "g1", brand: "Scribe", via: "nombre o alias" }]);
    expect(plan.productAssignments.map((row) => row.productId)).toEqual(["v1", "v2"]);
    expect(plan.manualReview).toEqual([
      { kind: "group", id: "g2", reason: "el texto dice «Marca Uno» y el nombre dice «Scribe»" },
    ]);
  });

  it("es idempotente: lo que ya tiene marca no vuelve a entrar", () => {
    const plan = planBrandInitialData({
      config,
      existingBrands: [
        { id: "b1", name: "Marca Uno", aliases: [], isArchived: false },
        { id: "b2", name: "Scribe", aliases: ["Incolors"], isArchived: false },
      ],
      normalize: normalizeBrandName,
      groups: [],
      products: [product("p1", "Colores Incolors", { brandId: "b2" }), product("p2", "Cuaderno Scribe")],
    });
    expect(plan.createBrands).toEqual([]);
    expect(plan.productAssignments.map((row) => row.productId)).toEqual(["p2"]);
    expect(planFingerprint(plan)).toBe(planFingerprint({ ...plan }));
  });
});
