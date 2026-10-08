import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), verifyStoreOwner: vi.fn(), findProduct: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner, CACHE_HEADERS: { NO_CACHE: {} } }));
vi.mock("@/lib/prismadb", () => ({ default: { product: { findFirst: mocks.findProduct } } }));

import { GET } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/product-photos/route";
import { GALLERY_ORDER } from "@/lib/variant-gallery";

const request = (productId?: string) =>
  new Request(`http://x/api/store-1/marketplaces/mercadolibre/listings/product-photos${productId ? `?productId=${productId}` : ""}`);

describe("GET /marketplaces/mercadolibre/listings/product-photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
  });

  it("returns every photo of the product in gallery order (cover first), plus its group name and kit flag", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "p1",
      isKit: false,
      brand: null,
      productGroup: { name: "Bitácora-Agenda William Morris" },
      images: [{ url: "cover.jpg", isMain: true }, { url: "b.jpg", isMain: false }],
    });
    const response = await GET(request("p1"), { params: { storeId: "store-1" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      productId: "p1",
      isKit: false,
      brand: null,
      productGroupName: "Bitácora-Agenda William Morris",
      images: [{ url: "cover.jpg", isMain: true }, { url: "b.jpg", isMain: false }],
    });
    const query = mocks.findProduct.mock.calls[0][0];
    expect(query.where).toEqual({ id: "p1", storeId: "store-1" });
    expect(query.select.images.orderBy).toEqual(GALLERY_ORDER);
  });

  it("requires a product id and the store owner", async () => {
    expect((await GET(request(), { params: { storeId: "store-1" } })).status).toBe(400);
    mocks.verifyStoreOwner.mockRejectedValueOnce(Object.assign(new Error("No"), { statusCode: 403 }));
    expect((await GET(request("p1"), { params: { storeId: "store-1" } })).status).toBeGreaterThanOrEqual(400);
    expect(mocks.findProduct).not.toHaveBeenCalled();
  });

  it("answers 404 for a product of another store", async () => {
    mocks.findProduct.mockResolvedValue(null);
    expect((await GET(request("other"), { params: { storeId: "store-1" } })).status).toBe(404);
  });
});
