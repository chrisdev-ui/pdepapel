import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProducts: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.example.com/api/store" } }));
vi.mock("@/lib/public-env", async () => ({ publicEnv: (await import("@/lib/env.mjs")).env }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/actions/get-categories", () => ({ getCategories: vi.fn(async () => []) }));
vi.mock("@/actions/get-types", () => ({ getTypes: vi.fn(async () => []) }));
vi.mock("@/actions/get-catalog-options", () => ({ getCatalogOptions: vi.fn() }));
vi.mock("@/actions/get-colors", () => ({ getColors: vi.fn() }));
vi.mock("@/actions/get-designs", () => ({ getDesigns: vi.fn() }));
vi.mock("@/actions/get-brands", () => ({ getBrands: vi.fn(async () => []), getBrand: vi.fn() }));
vi.mock("@/actions/get-products", () => ({ getProducts: mocks.getProducts, getListingProducts: vi.fn() }));

import { generateMetadata } from "@/app/(routes)/tienda/page";

const metadataFor = (searchParams: Record<string, string>) =>
  generateMetadata({ searchParams } as unknown as Parameters<typeof generateMetadata>[0]);

/**
 * `/tienda?page=9999` respondía 200 con una meta refresh: la redirección se
 * lanzaba dentro del Suspense, con la cabecera ya enviada. En los metadatos
 * corre antes de enviar nada, así que Next responde un 307 de verdad.
 */
describe("/tienda con una página fuera de rango", () => {
  beforeEach(() => {
    mocks.getProducts.mockReset();
    mocks.redirect.mockClear();
    mocks.getProducts.mockResolvedValue({ products: [], totalPages: 24, totalItems: 573 });
  });

  it("redirige desde los metadatos a la última página, con los mismos filtros", async () => {
    await expect(metadataFor({ page: "9999", colorId: "rosa" })).rejects.toThrow("NEXT_REDIRECT /tienda?page=24&colorId=rosa");
    expect(mocks.getProducts).toHaveBeenCalledWith(expect.objectContaining({ page: "9999", colorId: "rosa", itemsPerPage: 24, fromShop: true }));
  });

  it("dentro del rango no redirige", async () => {
    await expect(metadataFor({ page: "3" })).resolves.toMatchObject({ title: "Tienda en línea" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sin `page` no pide el catálogo solo para los metadatos", async () => {
    await metadataFor({ colorId: "rosa" });
    expect(mocks.getProducts).not.toHaveBeenCalled();
  });
});
