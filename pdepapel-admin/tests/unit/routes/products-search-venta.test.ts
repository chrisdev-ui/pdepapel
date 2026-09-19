import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  prices: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: vi.fn() }));
vi.mock("@/lib/prismadb", () => ({ default: { product: { findFirst: mocks.findFirst, findMany: mocks.findMany } } }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: () => ({ get: mocks.redisGet, set: mocks.redisSet }) } }));
vi.mock("@/lib/discount-engine", () => ({ getProductsPrices: mocks.prices }));

import { GET } from "@/app/api/[storeId]/products/search/route";

const call = (params: string) => GET(new Request(`https://admin.test/api/store-1/products/search?${params}`), { params: { storeId: "store-1" } });
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, sku: id.toUpperCase(), gtin: null, stock: 2, price: 10000, soldCount: 0, categoryId: "c", productGroupId: null, isKit: false, images: [], kitComponents: [], ...extra });

/** Vender: `mode=venta` ordena para el mostrador y trae el precio con oferta. */
describe("GET /products/search?mode=venta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.prices.mockImplementation(async (products: { id: string; price: number }[]) => new Map(products.map((p) => [p.id, { price: p.id === "oferta" ? 8000 : p.price, originalPrice: p.price, discount: 0, offerLabel: p.id === "oferta" ? "20% OFF" : null, matchedOfferId: null }])));
  });

  it("puts the exact code first, sold-out last, and carries the offer price", async () => {
    mocks.findFirst.mockResolvedValue(row("codigo", { sku: "LIB-1", soldCount: 0 }));
    mocks.findMany.mockResolvedValue([row("agotado", { name: "Lib agotada", stock: 0, soldCount: 900 }), row("oferta", { name: "Lib oferta", soldCount: 3 }), row("codigo", { sku: "LIB-1" })]);
    const response = await call("mode=venta&q=LIB-1&limit=30");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.map((item: { id: string }) => item.id)).toEqual(["codigo", "oferta", "agotado"]);
    expect(body.data[0]).toMatchObject({ match: "codigo", available: true });
    expect(body.data[1]).toMatchObject({ offerPrice: 8000, offerLabel: "20% OFF", price: 10000 });
    expect(body.data[2]).toMatchObject({ available: false });
    expect(body.metadata).toEqual({ hasMore: false, nextPage: null, total: 3, truncated: false });
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", isArchived: false, OR: [{ sku: "LIB-1" }, { gtin: "LIB-1" }] });
    expect(mocks.redisSet.mock.calls[0][0]).toBe("store:store-1:admin-select:venta:lib-1:1");
  });

  it("returns best-sellers with units for the empty query (preloaded first page)", async () => {
    mocks.findMany.mockResolvedValue([row("b", { soldCount: 5 }), row("a", { soldCount: 20 })]);
    const response = await call("mode=venta&q=&limit=30");
    const body = await response.json();
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ where: { storeId: "store-1", isArchived: false, stock: { gt: 0 } }, orderBy: [{ soldCount: "desc" }, { name: "asc" }] });
    expect(body.data.map((item: { id: string }) => item.id)).toEqual(["a", "b"]);
  });

  it("keeps the classic mode untouched for the other pickers", async () => {
    mocks.findMany.mockResolvedValue([row("x")]);
    const response = await call("q=x&limit=20");
    const body = await response.json();
    expect(body.metadata).toEqual({ hasMore: false, nextPage: null });
    expect(mocks.prices).not.toHaveBeenCalled();
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { updatedAt: "desc" } });
  });
});
