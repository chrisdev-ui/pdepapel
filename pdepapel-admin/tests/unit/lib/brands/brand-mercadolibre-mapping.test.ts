import { describe, expect, it } from "vitest";

import type { PlanBrand } from "@/lib/brand-initial-data";
import { planBrandsFromMercadoLibre, type MercadoLibreBrandConfig } from "@/lib/brand-mercadolibre-mapping";

const config: MercadoLibreBrandConfig = {
  storeId: "store",
  brands: [{ name: "ZjKamei", isVisible: false }, { name: "Gipao", isVisible: false }],
  valueMapping: { ZjKamei: { brand: "ZjKamei" }, Gipao: { brand: "Gipao" }, Fashion: { brand: "Klipp" }, "Genérica": { none: true } },
};

const klipp: PlanBrand = { id: "b-klipp", name: "Klipp", aliases: ["Fashion"], isArchived: false, isVisible: false, parentBrandId: null };

const product = (id: string, extra: Partial<{ brandId: string | null; productGroupId: string | null; isArchived: boolean }> = {}) => ({
  id,
  name: id,
  brand: null,
  brandId: null,
  isArchived: false,
  productGroupId: null,
  ...extra,
});

const listing = (externalItemId: string, productId: string, mlBrand: string) => ({ externalItemId, productId, mlBrand });

const plan = (input: Partial<Parameters<typeof planBrandsFromMercadoLibre>[0]>) =>
  planBrandsFromMercadoLibre({ config, listings: [], existingBrands: [klipp], products: [], groups: [], ...input });

describe("marcas desde el BRAND de Mercado Libre", () => {
  it("crea las ocultas, asigna por valor y deja sin marca los genéricos", () => {
    const result = plan({
      products: [product("p1"), product("p2"), product("p3")],
      listings: [listing("MCO1", "p1", "ZJKAMEI"), listing("MCO2", "p2", "Fashion"), listing("MCO3", "p3", "Genérica")],
    });
    expect(result.createBrands.map((row) => [row.name, row.isVisible])).toEqual([
      ["ZjKamei", false],
      ["Gipao", false],
    ]);
    expect(result.productAssignments).toEqual([
      { productId: "p1", brand: "ZjKamei", via: "BRAND de Mercado Libre" },
      { productId: "p2", brand: "Klipp", via: "BRAND de Mercado Libre" },
    ]);
    expect(result.manualReview).toEqual([]);
    expect(result.rows).toBe(4);
  });

  it("un producto de un grupo arrastra a todo el grupo y se distingue lo que vino por el grupo", () => {
    const result = plan({
      groups: [{ id: "g1", name: "Grupo", brand: null, brandId: null }],
      products: [product("v1", { productGroupId: "g1" }), product("v2", { productGroupId: "g1", isArchived: true })],
      listings: [listing("MCO1", "v1", "Gipao")],
    });
    expect(result.groupAssignments).toEqual([{ productGroupId: "g1", brand: "Gipao", via: "BRAND de Mercado Libre" }]);
    expect(result.productAssignments).toEqual([
      { productId: "v1", brand: "Gipao", via: "BRAND de Mercado Libre" },
      { productId: "v2", brand: "Gipao", via: "grupo" },
    ]);
  });

  it("revisión manual: valor sin decisión y un grupo con dos marcas; lo que ya tiene marca no entra", () => {
    const result = plan({
      groups: [{ id: "g1", name: "Grupo", brand: null, brandId: null }],
      products: [
        product("v1", { productGroupId: "g1" }),
        product("v2", { productGroupId: "g1" }),
        product("p3"),
        product("p4", { brandId: "b-klipp" }),
      ],
      listings: [listing("MCO1", "v1", "Gipao"), listing("MCO2", "v2", "ZjKamei"), listing("MCO3", "p3", "Yulanz"), listing("MCO4", "p4", "Gipao")],
    });
    expect(result.groupAssignments).toEqual([]);
    expect(result.productAssignments).toEqual([]);
    expect(result.manualReview).toEqual([
      { kind: "product", id: "p3", reason: "BRAND de Mercado Libre sin decisión: «Yulanz»" },
      { kind: "group", id: "g1", reason: "publicaciones con marcas distintas: Gipao / ZjKamei" },
    ]);
  });

  it("es idempotente: con las marcas creadas y asignadas no queda nada", () => {
    const existingBrands: PlanBrand[] = [
      klipp,
      { id: "b-zj", name: "ZjKamei", aliases: [], isArchived: false, isVisible: false, parentBrandId: null },
      { id: "b-gi", name: "Gipao", aliases: [], isArchived: false, isVisible: false, parentBrandId: null },
    ];
    const result = plan({ existingBrands, products: [product("p1", { brandId: "b-zj" })], listings: [listing("MCO1", "p1", "ZjKamei")] });
    expect(result.rows).toBe(0);
  });
});
