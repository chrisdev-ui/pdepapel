import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchCatalogProducts: vi.fn() }));

vi.mock("@/lib/catalog-fetch", () => ({
  fetchCatalogProducts: mocks.fetchCatalogProducts,
}));

import { GET, dynamic } from "@/app/api/catalog/route";

const request = (search: string) =>
  new NextRequest(`https://papeleriapdepapel.com/api/catalog${search}`);

describe("/api/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCatalogProducts.mockResolvedValue({
      products: [],
      totalItems: 0,
      totalPages: 0,
    });
  });

  it("never gets prerendered: a cached catalog route would freeze the filters", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("hands the upstream the same filters it received", async () => {
    await GET(
      request(
        "?categoryId=c1%2Cc2&colorId=col1&minPrice=1000&maxPrice=9000&page=2&itemsPerPage=24&fromShop=true&isOnSale=true&groupBy=parents&search=cuaderno&exact=true",
      ),
    );

    expect(mocks.fetchCatalogProducts).toHaveBeenCalledWith({
      categoryId: "c1,c2",
      colorId: "col1",
      minPrice: 1000,
      maxPrice: 9000,
      page: 2,
      itemsPerPage: 24,
      fromShop: true,
      isOnSale: true,
      groupBy: "parents",
      search: "cuaderno",
      exact: true,
    });
  });

  it("reads fromShop=false as false, not as «vino algo»", async () => {
    await GET(request("?fromShop=false&isFeatured=false"));

    expect(mocks.fetchCatalogProducts).toHaveBeenCalledWith({
      fromShop: false,
      isFeatured: false,
    });
  });

  it("ignores an availability it does not know", async () => {
    await GET(request("?availability=inventado"));
    expect(mocks.fetchCatalogProducts).toHaveBeenCalledWith({});

    await GET(request("?availability=coming-soon"));
    expect(mocks.fetchCatalogProducts).toHaveBeenLastCalledWith({
      availability: "coming-soon",
    });
  });

  it("returns the catalog shape the client already knows", async () => {
    mocks.fetchCatalogProducts.mockResolvedValue({
      products: [{ id: "p1" }],
      totalItems: 1,
      totalPages: 1,
      facets: { colors: [] },
    });

    const response = await GET(request("?fromShop=true"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      products: [{ id: "p1" }],
      totalItems: 1,
      totalPages: 1,
      facets: { colors: [] },
    });
  });

  it("passes an upstream outage through instead of inventing an empty catalog", async () => {
    mocks.fetchCatalogProducts.mockResolvedValue({
      products: [],
      totalItems: 0,
      totalPages: 0,
      isUnavailable: true,
    });

    const response = await GET(request(""));
    await expect(response.json()).resolves.toMatchObject({
      isUnavailable: true,
    });
  });
});
