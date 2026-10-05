import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCategories: vi.fn(),
  getSitemapProducts: vi.fn(),
  getProducts: vi.fn(),
}));

vi.mock("@/actions/get-categories", () => ({
  getCategories: mocks.getCategories,
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
    mocks.getSitemapProducts.mockResolvedValue([]);
    const without = (await sitemap()).map((entry) => entry.url);
    expect(without).not.toContain("https://papeleriapdepapel.com/proximamente");

    mocks.getProducts.mockResolvedValue({ products: [{ id: "llega" }] });
    const withProducts = (await sitemap()).map((entry) => entry.url);
    expect(withProducts).toContain("https://papeleriapdepapel.com/proximamente");
    expect(mocks.getProducts).toHaveBeenCalledWith(expect.objectContaining({ availability: "coming-soon" }));
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
