import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  findProductSlugAlias: vi.fn(),
  calculateDiscountedPrice: vi.fn(),
}));

vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    MissingStoreId: () => new Error("Missing store ID"),
    InvalidRequest: (message: string) => new Error(message),
    NotFound: (message: string) => new Error(message),
  },
  handleErrorResponse: (
    _error: unknown,
    _context: string,
    options?: { headers?: HeadersInit },
  ) => new Response(null, { status: 500, headers: options?.headers }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({ default: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findFirst: mocks.findProduct },
    productSlugAlias: { findUnique: mocks.findProductSlugAlias },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { DYNAMIC: { "Cache-Control": "public, max-age=60" } },
  generateRandomSKU: vi.fn(),
  getPublicIdFromCloudinaryUrl: vi.fn(),
  verifyStoreOwner: vi.fn(),
}));
vi.mock("@/lib/variant-generator", () => ({ generateSemanticSKU: vi.fn() }));
vi.mock("@/lib/slugify", () => ({ generateProductSlug: vi.fn() }));
vi.mock("@/lib/product-identifiers", () => ({
  normalizeProductIdentifiers: vi.fn(),
}));
vi.mock("@/lib/rich-text", () => ({ sanitizeRichTextHtml: vi.fn() }));
vi.mock("@/lib/product-slugs", () => ({
  getUniqueProductSlug: vi.fn(),
  preserveProductSlugAlias: vi.fn(),
  synchronizeProductGroupSlugs: vi.fn(),
}));
vi.mock("@/lib/discount-engine", () => ({
  calculateDiscountedPrice: mocks.calculateDiscountedPrice,
}));
vi.mock("@clerk/nextjs", () => ({ auth: vi.fn() }));

import {
  GET,
  OPTIONS,
} from "@/app/api/[storeId]/products/[productId]/route";

describe("public product detail CORS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProduct.mockResolvedValue({
      id: "product-id",
      name: "Resaltador lila",
      price: 12000,
    });
    mocks.calculateDiscountedPrice.mockResolvedValue({
      price: 10000,
      discount: 2000,
      offerLabel: "Oferta",
    });
  });

  it("allows the storefront to fetch a selected variant", async () => {
    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products/resaltador-lila",
        { headers: { Origin: "https://papeleriapdepapel.com" } },
      ),
      { params: { storeId: "store-id", productId: "resaltador-lila" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    await expect(response.json()).resolves.toMatchObject({
      id: "product-id",
      price: 10000,
    });
  });

  it("keeps CORS headers when a product detail request fails", async () => {
    mocks.findProduct.mockResolvedValue(null);
    mocks.findProductSlugAlias.mockResolvedValue(null);

    const response = await GET(
      new Request("https://admin.example.com/api/store-id/products/missing", {
        headers: { Origin: "https://papeleriapdepapel.com" },
      }),
      { params: { storeId: "store-id", productId: "missing" } },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
  });

  it("supports a browser CORS preflight request", async () => {
    const response = await OPTIONS(
      new Request("https://admin.example.com/api/store-id/products/product", {
        method: "OPTIONS",
        headers: { Origin: "https://papeleriapdepapel.com" },
      }),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, OPTIONS",
    );
  });

  it("does not grant browser access to untrusted origins", async () => {
    const response = await OPTIONS(
      new Request("https://admin.example.com/api/store-id/products/product", {
        method: "OPTIONS",
        headers: { Origin: "https://example-attacker.com" },
      }),
    );

    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
