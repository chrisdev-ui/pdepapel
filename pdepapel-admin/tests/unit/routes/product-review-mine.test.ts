import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findReview: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } } }));
vi.mock("@/lib/prismadb", () => ({
  default: { review: { findFirst: mocks.findReview } },
}));

import { GET } from "@/app/api/[storeId]/products/[productId]/reviews/mine/route";

const params = { storeId: "store-1", productId: "product-1" };
const request = new Request("https://admin.test/api/store-1/products/product-1/reviews/mine", {
  headers: { Origin: "https://papeleriapdepapel.com" },
});

describe("GET /products/[productId]/reviews/mine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a session", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
    expect(mocks.findReview).not.toHaveBeenCalled();
  });

  it("returns only the caller's review for the product, scoped by store", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.findReview.mockResolvedValue({ id: "review-1", rating: 4, status: "PUBLISHED" });

    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(mocks.findReview).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", productId: "product-1", storeId: "store-1" },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      review: { id: "review-1", rating: 4, status: "PUBLISHED" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://papeleriapdepapel.com");
  });

  it("answers null when the customer has not reviewed the product", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.findReview.mockResolvedValue(null);
    await expect((await GET(request, { params })).json()).resolves.toEqual({ review: null });
  });
});
