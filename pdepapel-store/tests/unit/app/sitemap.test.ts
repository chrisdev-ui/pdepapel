import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCategories: vi.fn(),
  getSitemapProducts: vi.fn(),
  getProducts: vi.fn(),
}));

vi.mock("@/actions/get-categories", () => ({
  getCategoriesOrThrow: mocks.getCategories,
}));
vi.mock("@/actions/get-sitemap-products", () => ({
  getSitemapProducts: mocks.getSitemapProducts,
}));
vi.mock("@/actions/get-products", () => ({
  getProducts: mocks.getProducts,
}));

import sitemap from "@/app/sitemap";

describe("storefront sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCategories.mockResolvedValue([]);
    mocks.getProducts.mockResolvedValue({ products: [] });
  });

  /** Sin productos por llegar, /proximamente es noindex y no va en el sitemap. */
  it("lists /proximamente only while there are coming-soon products", async () => {
    mocks.getSitemapProducts.mockResolvedValue([{ id: "p", slug: "producto", isArchived: false }]);
    const without = (await sitemap()).map((entry) => entry.url);
    expect(without).not.toContain("https://papeleriapdepapel.com/proximamente");

    mocks.getProducts.mockResolvedValue({ products: [{ id: "llega" }] });
    const withProducts = (await sitemap()).map((entry) => entry.url);
    expect(withProducts).toContain("https://papeleriapdepapel.com/proximamente");
    expect(mocks.getProducts).toHaveBeenCalledWith(expect.objectContaining({ availability: "coming-soon" }));
  });

  /**
   * Antes el sitemap se publicaba solo con las páginas fijas si el catálogo
   * fallaba, y quedaba así en caché. Ahora falla y Next sigue sirviendo el
   * último sitemap bueno.
   */
  it.each([
    ["the products endpoint fails", () => mocks.getSitemapProducts.mockRejectedValue(new Error("502"))],
    ["the categories endpoint fails", () => {
      mocks.getSitemapProducts.mockResolvedValue([{ id: "p", slug: "producto", isArchived: false }]);
      mocks.getCategories.mockRejectedValue(new Error("502"));
    }],
    ["the catalog comes back with no active products", () => mocks.getSitemapProducts.mockResolvedValue([{ id: "a", slug: "archivado", isArchived: true }])],
  ])("fails instead of publishing a degraded sitemap when %s", async (_case, arrange) => {
    arrange();
    await expect(sitemap()).rejects.toThrow();
  });

  it("excludes archived products even if the catalog API returns one", async () => {
    mocks.getSitemapProducts.mockResolvedValue([
      {
        id: "active-product-id",
        slug: "producto-activo",
        isArchived: false,
      },
      {
        id: "archived-product-id",
        slug: "producto-archivado",
        isArchived: true,
      },
    ]);

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(
      "https://papeleriapdepapel.com/producto/producto-activo",
    );
    expect(urls).not.toContain(
      "https://papeleriapdepapel.com/producto/producto-archivado",
    );
  });
});
