import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProducts: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: mocks.findProducts },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    SEMI_STATIC: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  },
}));

import {
  GET,
  OPTIONS,
} from "@/app/api/[storeId]/products/sitemap/route";

describe("public product sitemap endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProducts.mockResolvedValue([
      {
        id: "active-product-id",
        slug: "producto-activo",
        updatedAt: new Date("2026-09-02T00:00:00.000Z"),
        isArchived: false,
      },
    ]);
  });

  it("returns only the lightweight active-product index", async () => {
    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products/sitemap",
        { headers: { Origin: "https://papeleriapdepapel.com" } },
      ),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(mocks.findProducts).toHaveBeenCalledWith({
      where: { storeId: "store-id", isArchived: false },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        isArchived: true,
      },
      orderBy: { id: "asc" },
    });
    await expect(response.json()).resolves.toEqual([
      {
        id: "active-product-id",
        slug: "producto-activo",
        updatedAt: "2026-09-02T00:00:00.000Z",
        isArchived: false,
      },
    ]);
  });

  it("supports storefront CORS preflight", async () => {
    const response = await OPTIONS(
      new Request(
        "https://admin.example.com/api/store-id/products/sitemap",
        {
          method: "OPTIONS",
          headers: { Origin: "https://papeleriapdepapel.com" },
        },
      ),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
  });
});
