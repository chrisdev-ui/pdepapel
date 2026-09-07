import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findStore: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: { store: { findUnique: mocks.findStore } },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    SEMI_STATIC: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  },
}));

import { GET, OPTIONS } from "@/app/api/[storeId]/public/storefront/route";

const request = (origin = "https://papeleriapdepapel.com") =>
  new Request("https://admin.example.com/api/store-1/public/storefront", {
    headers: { Origin: origin },
  });

describe("public storefront settings endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("exposes only the free-shipping threshold and store name, with CORS and caching", async () => {
    mocks.findStore.mockResolvedValue({
      id: "store-1",
      name: "P de Papel",
      freeShippingThreshold: 120000,
      userId: "user-secret",
      email: "owner@example.com",
    });

    const response = await GET(request(), { params: { storeId: "store-1" } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      storeId: "store-1",
      name: "P de Papel",
      freeShippingThreshold: 120000,
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(mocks.findStore).toHaveBeenCalledWith({
      where: { id: "store-1" },
      select: { id: true, name: true, freeShippingThreshold: true },
    });
  });

  it("reports a disabled threshold as null", async () => {
    mocks.findStore.mockResolvedValue({
      id: "store-1",
      name: "P de Papel",
      freeShippingThreshold: null,
    });

    const response = await GET(request(), { params: { storeId: "store-1" } });

    await expect(response.json()).resolves.toMatchObject({
      freeShippingThreshold: null,
    });
  });

  it("returns 404 for an unknown store and answers preflight", async () => {
    mocks.findStore.mockResolvedValue(null);

    const response = await GET(request(), { params: { storeId: "nope" } });
    expect(response.status).toBe(404);

    const preflight = await OPTIONS(request());
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
  });
});
