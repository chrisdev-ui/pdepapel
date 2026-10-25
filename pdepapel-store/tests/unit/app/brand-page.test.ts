import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  getBrands: vi.fn(),
  getProducts: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));
vi.mock("@/lib/public-env", async () => ({ publicEnv: (await import("@/lib/env.mjs")).env }));
vi.mock("@/actions/get-brands", () => ({ getBrand: mocks.getBrand, getBrands: mocks.getBrands }));
vi.mock("@/actions/get-products", () => ({
  getProducts: mocks.getProducts,
  getListingProducts: (_searchParams: object, query: object) => mocks.getProducts(query),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, permanentRedirect: mocks.permanentRedirect, redirect: vi.fn() }));

import { generateStaticParams } from "@/app/(routes)/catalogo-cache/marcas/[slug]/page";
import { generateMetadata } from "@/app/(routes)/marcas/[slug]/page";
import { BASE_URL } from "@/constants";

const brand = (productCount: number) => ({
  kind: "brand",
  brand: {
    id: "b1",
    name: "Marca de prueba",
    slug: "marca-de-prueba",
    logoUrl: null,
    logoHasBackground: false,
    logoPermission: "UNKNOWN",
    color: null,
    seoText: "Texto de prueba para la marca.",
    isFeatured: false,
    sortOrder: 0,
    productCount,
    categories: [],
  },
});

const metadata = (searchParams: Record<string, string> = {}, slug = "marca-de-prueba") =>
  generateMetadata({ params: { slug }, searchParams });
const robotsOf = async (searchParams: Record<string, string> = {}) => (await metadata(searchParams)).robots as { index: boolean; follow: boolean };

describe("/marcas/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProducts.mockResolvedValue({ products: [], totalPages: 1, totalItems: 3 });
  });

  it("canónica propia, texto SEO como descripción, y se indexa desde 3 productos", async () => {
    mocks.getBrand.mockResolvedValue(brand(3));
    const meta = await metadata();
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/marcas/marca-de-prueba`);
    expect(meta.description).toBe("Texto de prueba para la marca.");
    expect(meta.robots).toMatchObject({ index: true, follow: true });
    expect(mocks.getProducts).toHaveBeenCalledWith(expect.objectContaining({ marca: "marca-de-prueba", fromShop: true, groupBy: "parents" }));
  });

  it("con menos de 3 productos queda noindex, follow", async () => {
    mocks.getBrand.mockResolvedValue(brand(2));
    expect(await robotsOf()).toMatchObject({ index: false, follow: true });
  });

  it("sin productos (estado vacío) queda noindex", async () => {
    mocks.getBrand.mockResolvedValue(brand(0));
    mocks.getProducts.mockResolvedValue({ products: [], totalPages: 0, totalItems: 0 });
    expect(await robotsOf()).toMatchObject({ index: false, follow: true });
  });

  it("con parámetros (subcategoría, orden) no se indexa y apunta a la base", async () => {
    mocks.getBrand.mockResolvedValue(brand(5));
    const meta = await metadata({ categoryId: "c1" });
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.alternates?.canonical).toBe(`${BASE_URL}/marcas/marca-de-prueba`);
  });

  it("una dirección vieja redirige de forma permanente a la actual", async () => {
    mocks.getBrand.mockResolvedValue({ kind: "redirect", slug: "marca-nueva" });
    await expect(metadata({}, "marca-vieja")).rejects.toThrow("REDIRECT /marcas/marca-nueva");
  });

  it("oculta, archivada o inexistente: 404", async () => {
    mocks.getBrand.mockResolvedValue({ kind: "missing" });
    await expect(metadata({}, "oculta")).rejects.toThrow("NOT_FOUND");
  });

  it("la copia en caché se genera para las marcas visibles con productos", async () => {
    mocks.getBrands.mockResolvedValue([{ slug: "marca-uno" }, { slug: "marca-dos" }]);
    await expect(generateStaticParams()).resolves.toEqual([{ slug: "marca-uno" }, { slug: "marca-dos" }]);
  });
});
