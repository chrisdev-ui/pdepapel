import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findMany: vi.fn(),
  productFindMany: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
  getProductsPrices: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    customerWishlistItem: { findMany: mocks.findMany, createMany: mocks.createMany, deleteMany: mocks.deleteMany },
    product: { findMany: mocks.productFindMany },
    $transaction: async (run: (tx: unknown) => Promise<void>) =>
      run({ customerWishlistItem: { createMany: mocks.createMany, deleteMany: mocks.deleteMany } }),
  },
}));
vi.mock("@/lib/discount-engine", () => ({ getProductsPrices: mocks.getProductsPrices }));
vi.mock("@/lib/cors", () => ({ createCorsHeaders: () => ({}) }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } } }));

import { GET, PUT } from "@/app/api/[storeId]/account/wishlist/route";

const params = { storeId: "store-id" };
const base = "https://admin.example.com/api/store-id/account/wishlist";
const savedAt = new Date("2026-09-01T12:00:00Z");

describe("customer wishlist API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "customer-id" });
    mocks.findMany.mockResolvedValue([{ productId: "p1", savedPrice: 13000, createdAt: savedAt }]);
    mocks.productFindMany.mockResolvedValue([{ id: "p1", categoryId: "c1", price: 15000, productGroupId: null }]);
    mocks.getProductsPrices.mockResolvedValue(new Map([["p1", { price: 13000, originalPrice: 15000, discount: 2000, offerLabel: "Oferta", matchedOfferId: "o1" }]]));
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("returns the saved price and the real saved date with the ids", async () => {
    const response = await GET(new Request(base), { params });
    const body = await response.json();
    expect(body.productIds).toEqual(["p1"]);
    expect(body.items).toEqual([{ productId: "p1", savedPrice: 13000, createdAt: savedAt.toISOString() }]);
  });

  it("stores the effective price the customer saw when a product is saved", async () => {
    const response = await PUT(new Request(base, { method: "PUT", body: JSON.stringify({ productIds: ["p1"], mode: "merge" }) }), { params });
    expect(response.status).toBe(200);
    expect(mocks.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ storeId: "store-id", userId: "customer-id", productId: "p1", savedPrice: 13000 }], skipDuplicates: true }),
    );
  });

  it("falls back to the list price when no offer applies", async () => {
    mocks.getProductsPrices.mockResolvedValue(new Map());
    await PUT(new Request(base, { method: "PUT", body: JSON.stringify({ productIds: ["p1"], mode: "merge" }) }), { params });
    expect(mocks.createMany.mock.calls[0][0].data[0].savedPrice).toBe(15000);
  });
});
