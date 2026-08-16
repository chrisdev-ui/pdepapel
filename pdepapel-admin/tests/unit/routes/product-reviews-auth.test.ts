import { beforeEach, describe, expect, it, vi } from "vitest";

const TestApiError = vi.hoisted(
  () =>
    class TestApiError extends Error {
      constructor(
        message: string,
        public readonly status: number,
      ) {
        super(message);
      }
    },
);

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getUser: vi.fn(),
  findProduct: vi.fn(),
  findFirstReview: vi.fn(),
  createReview: vi.fn(),
  findUniqueReview: vi.fn(),
  updateReview: vi.fn(),
}));

vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    Unauthenticated: () => new TestApiError("Unauthenticated", 401),
    Unauthorized: () => new TestApiError("Unauthorized", 403),
    MissingStoreId: () => new TestApiError("Missing store ID", 400),
    InvalidRequest: (message: string) => new TestApiError(message, 400),
    NotFound: (message: string) => new TestApiError(message, 404),
  },
  handleErrorResponse: (error: unknown, _context: string, options?: {
    headers?: HeadersInit;
  }) =>
    new Response(null, {
      status: error instanceof TestApiError ? error.status : 500,
      headers: options?.headers,
    }),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findUnique: mocks.findProduct },
    review: {
      findFirst: mocks.findFirstReview,
      create: mocks.createReview,
      findUnique: mocks.findUniqueReview,
      update: mocks.updateReview,
    },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    DYNAMIC: { "Cache-Control": "public, max-age=60" },
    NO_CACHE: { "Cache-Control": "no-store" },
  },
}));
vi.mock("@clerk/nextjs", () => ({
  auth: mocks.auth,
  clerkClient: { users: { getUser: mocks.getUser } },
}));

import { POST } from "@/app/api/[storeId]/products/[productId]/reviews/route";
import { PATCH } from "@/app/api/[storeId]/products/[productId]/reviews/[reviewId]/route";

const productParams = { storeId: "store-id", productId: "product-id" };
const reviewParams = { ...productParams, reviewId: "review-id" };
const storefrontRequest = (body: Record<string, unknown>) =>
  new Request("https://admin.example.com/api/store-id/products/product-id/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://papeleriapdepapel.com",
    },
    body: JSON.stringify(body),
  });

describe("product review authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "reviewer-id" });
    mocks.getUser.mockResolvedValue({ firstName: "Ana", lastName: "Pérez" });
    mocks.findProduct.mockResolvedValue({ id: "product-id" });
    mocks.findFirstReview.mockResolvedValue(null);
    mocks.createReview.mockResolvedValue({ id: "review-id" });
    mocks.updateReview.mockResolvedValue({ id: "review-id", rating: 5 });
  });

  it("rejects an anonymous review submission", async () => {
    mocks.auth.mockReturnValue({ userId: null });

    const response = await POST(
      storefrontRequest({ rating: 5, comment: "Hermoso" }),
      { params: productParams },
    );

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.createReview).not.toHaveBeenCalled();
  });

  it("uses the authenticated author instead of a user id supplied in the body", async () => {
    const response = await POST(
      storefrontRequest({
        rating: 5,
        comment: "Hermoso",
        userId: "another-customer-id",
      }),
      { params: productParams },
    );

    expect(response.status).toBe(200);
    expect(mocks.createReview).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "reviewer-id",
        name: "Ana Pérez",
        productId: "product-id",
      }),
    });
  });

  it("does not allow a different customer to update a review", async () => {
    mocks.findUniqueReview.mockResolvedValue({ userId: "another-customer-id" });

    const response = await PATCH(
      new Request(
        "https://admin.example.com/api/store-id/products/product-id/reviews/review-id",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://papeleriapdepapel.com",
          },
          body: JSON.stringify({ rating: 1 }),
        },
      ),
      { params: reviewParams },
    );

    expect(response.status).toBe(403);
    expect(mocks.updateReview).not.toHaveBeenCalled();
  });

  it("allows the review author to update their own review", async () => {
    mocks.findUniqueReview.mockResolvedValue({ userId: "reviewer-id" });

    const response = await PATCH(
      new Request(
        "https://admin.example.com/api/store-id/products/product-id/reviews/review-id",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://papeleriapdepapel.com",
          },
          body: JSON.stringify({ rating: 4, comment: "Muy bonito" }),
        },
      ),
      { params: reviewParams },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateReview).toHaveBeenCalledWith({
      where: { id: "review-id" },
      data: { rating: 4, comment: "Muy bonito" },
    });
  });
});
