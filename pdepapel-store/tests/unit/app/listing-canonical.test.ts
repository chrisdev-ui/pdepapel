import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCategory: vi.fn(),
  getCategories: vi.fn(async () => []),
  getTypes: vi.fn(async () => []),
  getBrands: vi.fn(async () => [{ id: "b1", name: "Kiut", slug: "kiut" }]),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));
vi.mock("@/lib/public-env", async () => ({ publicEnv: (await import("@/lib/env.mjs")).env }));
vi.mock("@/actions/get-category", () => ({ getCategory: mocks.getCategory }));
vi.mock("@/actions/get-categories", () => ({ getCategories: mocks.getCategories }));
vi.mock("@/actions/get-types", () => ({ getTypes: mocks.getTypes }));
vi.mock("@/actions/get-catalog-options", () => ({ getCatalogOptions: vi.fn() }));
vi.mock("@/actions/get-colors", () => ({ getColors: vi.fn() }));
vi.mock("@/actions/get-designs", () => ({ getDesigns: vi.fn() }));
vi.mock("@/actions/get-products", () => ({ getProducts: vi.fn() }));
vi.mock("@/actions/get-brands", () => ({ getBrands: mocks.getBrands, getBrand: vi.fn() }));

import { generateMetadata as categoryMetadata } from "@/app/(routes)/categoria/[slug]/page";
import { generateMetadata as shopMetadata } from "@/app/(routes)/tienda/page";
import { BASE_URL } from "@/constants";
import { getListingIndexing, getPaginationOnlyPage, singleBrandCanonical } from "@/lib/listing-seo";

type Params = Record<string, string>;
const shop = (searchParams: Params) =>
  shopMetadata({ searchParams } as unknown as Parameters<typeof shopMetadata>[0]);
const category = (searchParams: Params) =>
  categoryMetadata({ params: { slug: "cuadernos" }, searchParams } as unknown as Parameters<typeof categoryMetadata>[0]);
const robotsOf = (metadata: Awaited<ReturnType<typeof shop>>) => {
  const robots = metadata.robots as { index: boolean; follow: boolean; googleBot: { index: boolean; follow: boolean } };
  return { index: robots.index, follow: robots.follow, googleIndex: robots.googleBot.index };
};

/**
 * Canónica y robots por patrón de URL de los listados. La paginación sola
 * tiene canónica propia (Google: no apuntar la página 2 a la 1); todo lo demás
 * queda como estaba: filtros y orden con canónica a la base y noindex.
 */
describe("listing canonical and robots per url pattern", () => {
  it.each([
    [{}, "/tienda", true],
    [{ page: "2" }, "/tienda?page=2", false],
    [{ page: "15" }, "/tienda?page=15", false],
    [{ page: "1" }, "/tienda", false],
    [{ page: "0" }, "/tienda", false],
    [{ page: "-3" }, "/tienda", false],
    [{ page: "abc" }, "/tienda", false],
    [{ page: "2.5" }, "/tienda", false],
    [{ page: "2", colorId: "rosa" }, "/tienda", false],
    [{ sortOption: "priceAsc" }, "/tienda", false],
    [{ search: "agenda" }, "/tienda", false],
    [{ isOnSale: "true" }, "/tienda", false],
    [{ typeId: "escritura" }, "/tienda", false],
    // Una sola marca y nada más: la página de la marca es la canónica.
    [{ marca: "kiut" }, "/marcas/kiut", false],
    [{ marca: "kiut,norma" }, "/tienda", false],
    [{ marca: "kiut", colorId: "rosa" }, "/tienda", false],
    [{ marca: "kiut", page: "2" }, "/tienda", false],
  ])("/tienda %j → canonical %s, index %s", async (params, canonical, index) => {
    const metadata = await shop(params);
    expect(metadata.alternates?.canonical).toBe(`${BASE_URL}${canonical}`);
    expect(metadata.openGraph?.url).toBe(`${BASE_URL}${canonical}`);
    expect(robotsOf(metadata)).toEqual({ index, follow: true, googleIndex: index });
  });

  it.each([
    [true, {}, "/categoria/cuadernos", true],
    [false, {}, "/categoria/cuadernos", false],
    [true, { page: "2" }, "/categoria/cuadernos?page=2", false],
    [false, { page: "3" }, "/categoria/cuadernos?page=3", false],
    [true, { page: "1" }, "/categoria/cuadernos", false],
    [true, { page: "nope" }, "/categoria/cuadernos", false],
    [true, { page: "2", colorId: "rosa" }, "/categoria/cuadernos", false],
    [true, { minPrice: "1000" }, "/categoria/cuadernos", false],
  ])("/categoria (seoEnabled %s) %j → canonical %s, index %s", async (seoEnabled, params, canonical, index) => {
    mocks.getCategory.mockResolvedValue({ id: "c1", slug: "cuadernos", name: "Cuadernos", seoEnabled });
    const metadata = await category(params);
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.openGraph?.url).toBe(`${BASE_URL}${canonical}`);
    expect(robotsOf(metadata)).toEqual({ index, follow: true, googleIndex: index });
  });

  it("ignores empty values when deciding whether a url is filtered", () => {
    expect(getListingIndexing("/tienda", { colorId: "", page: "2" }, true)).toEqual({ canonical: "/tienda?page=2", index: false });
    expect(getListingIndexing("/tienda", { colorId: undefined }, true)).toEqual({ canonical: "/tienda", index: true });
    expect(getPaginationOnlyPage({ page: ["2", "3"] })).toBeNull();
  });

  it("sends only a single-brand shop url to the brand page", () => {
    expect(singleBrandCanonical({ marca: "kiut" })).toBe("/marcas/kiut");
    expect(singleBrandCanonical({ marca: " kiut ," })).toBe("/marcas/kiut");
    expect(singleBrandCanonical({ marca: "kiut,norma" })).toBeNull();
    expect(singleBrandCanonical({ marca: "kiut", sortOption: "priceAsc" })).toBeNull();
    expect(singleBrandCanonical({ marca: "" })).toBeNull();
  });

  it("titles a single-brand shop url with the brand name", async () => {
    const metadata = await shop({ marca: "kiut" });
    expect(metadata.title).toBe("Productos Kiut");
  });
});
