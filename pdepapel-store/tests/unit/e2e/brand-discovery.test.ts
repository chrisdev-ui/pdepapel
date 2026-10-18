import { describe, expect, it } from "vitest";

import {
  brandCandidates,
  discoveryApi,
  inStockOwnProducts,
  pickEmptyBrand,
  pickLine,
  PRODUCTION_ADMIN_API,
  type PublicBrandRow,
} from "../../e2e/brands/brand-discovery";

const brand = (slug: string, productCount: number, parent: string | null = null): PublicBrandRow => ({
  name: slug.toUpperCase(),
  slug,
  productCount,
  parent: parent ? { name: parent.toUpperCase(), slug: parent } : null,
});

describe("datos de marcas para el chequeo semanal", () => {
  it("solo usa la API de producción cuando la tienda probada es producción", () => {
    expect(discoveryApi({})).toBe(PRODUCTION_ADMIN_API);
    expect(discoveryApi({ E2E_BASE_URL: "https://papeleriapdepapel.com/" })).toBe(PRODUCTION_ADMIN_API);
    expect(discoveryApi({ E2E_BASE_URL: "http://127.0.0.1:3100" })).toBeNull();
    expect(discoveryApi({ E2E_BASE_URL: "http://127.0.0.1:3100", E2E_ADMIN_API_URL: "http://127.0.0.1:3101/api/x" })).toBe("http://127.0.0.1:3101/api/x");
  });

  it("la marca de prueba es principal y tiene tres productos propios con existencias", () => {
    const brands = [brand("kiut", 2), brand("incolors", 4, "scribe"), brand("norma", 5)];
    expect(brandCandidates(brands).map((row) => row.slug)).toEqual(["norma"]);
    const products = [
      { slug: "linea", stock: 9, brand: { slug: "flower-power" } },
      { slug: "grupo", stock: 9, isGroup: true, brand: { slug: "norma" } },
      { slug: "agotado", stock: 0, brand: { slug: "norma" } },
      { slug: "a", stock: 2, brand: { slug: "norma" } },
      { slug: "b", stock: 6, brand: { slug: "norma" } },
    ];
    expect(inStockOwnProducts("norma", products).map((row) => row.slug)).toEqual(["b", "a"]);
  });

  it("marca vacía y línea con madre; si no hay, nada", () => {
    expect(pickEmptyBrand([brand("norma", 5), brand("crayola", 0)])?.slug).toBe("crayola");
    expect(pickEmptyBrand([brand("norma", 5)])).toBeNull();
    expect(pickLine([brand("norma", 5)])).toBeNull();
    const brands = [brand("grande", 90), brand("linea-grande", 3, "grande"), brand("primavera", 12), brand("flower-power", 6, "primavera")];
    expect(pickLine(brands)?.slug).toBe("flower-power");
    expect(pickLine(brands.slice(0, 2))?.slug).toBe("linea-grande");
  });
});
