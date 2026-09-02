import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCategories: vi.fn(),
  getSitemapProducts: vi.fn(),
}));

vi.mock("@/actions/get-categories", () => ({
  getCategories: mocks.getCategories,
}));
vi.mock("@/actions/get-sitemap-products", () => ({
  getSitemapProducts: mocks.getSitemapProducts,
}));

import sitemap from "@/app/sitemap";

describe("storefront sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCategories.mockResolvedValue([]);
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
