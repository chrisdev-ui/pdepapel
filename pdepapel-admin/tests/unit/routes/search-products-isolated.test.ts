import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStoreRead: vi.fn(), auth: vi.fn(), findMany: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
// Las lecturas abiertas a cuentas de solo lectura pasan por este ayudante.
vi.mock("@/lib/store-access", () => ({
  requireStoreRead: mocks.requireStoreRead,
}));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({
  default: { product: { findMany: mocks.findMany } },
}));

import { GET } from "@/app/api/[storeId]/search/products/isolated/route";

const call = (query: string, extra = "") =>
  GET(
    new Request(
      `https://admin.test/api/store-1/search/products/isolated?query=${encodeURIComponent(query)}${extra}`,
    ),
    {
      params: { storeId: "store-1" },
    },
  );

describe("GET /search/products/isolated", () => {
  beforeEach(() => {
    mocks.requireStoreRead.mockResolvedValue({ userId: "owner", role: "owner" });
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
  });

  it("matches the query against name, description and sku, only among standalone active products", async () => {
    const row = {
      id: "p1",
      name: "Cartuchera lucky girls",
      sku: "CLG-1",
      productGroupId: null,
    };
    mocks.findMany.mockResolvedValue([row]);

    const response = await call("CLG-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [row],
      metadata: { page: 1, limit: 20, hasMore: false },
    });
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      storeId: "store-1",
      productGroupId: null,
      isArchived: false,
    });
    expect(where.OR).toEqual([
      { name: { contains: "CLG-1" } },
      { description: { contains: "CLG-1" } },
      { sku: { contains: "CLG-1" } },
    ]);
  });

  it("filters by shared image urls when asked", async () => {
    mocks.findMany.mockResolvedValue([]);
    await call(
      "",
      "&imageUrls=" + encodeURIComponent("https://a/1.jpg,https://a/2.jpg"),
    );
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.images).toEqual({
      some: { url: { in: ["https://a/1.jpg", "https://a/2.jpg"] } },
    });
    expect(where.OR).toBeUndefined();
  });
});
