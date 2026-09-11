import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  findProductSlugAlias: vi.fn(),
  calculateDiscountedPrice: vi.fn(),
  auth: vi.fn(),
  checkIfStoreOwner: vi.fn(),
}));

vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: {
    MissingStoreId: () => new Error("Missing store ID"),
    InvalidRequest: (message: string) => new Error(message),
    NotFound: (message: string) =>
      Object.assign(new Error(message), { statusCode: 404 }),
  },
  handleErrorResponse: vi.fn(
    (
      error: unknown,
      _context: string,
      options?: { headers?: HeadersInit },
    ) =>
      new Response(null, {
        status:
          error && typeof error === "object" && "statusCode" in error
            ? Number(error.statusCode)
            : 500,
        headers: options?.headers,
      }),
  ),
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
  checkIfStoreOwner: mocks.checkIfStoreOwner,
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
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

import {
  GET,
  OPTIONS,
} from "@/app/api/[storeId]/products/[productId]/route";
import { handleErrorResponse } from "@/lib/api-errors";

describe("public product detail CORS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.checkIfStoreOwner.mockResolvedValue(false);
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

  it("keeps CORS headers when a public product detail is missing", async () => {
    mocks.findProduct.mockResolvedValue(null);
    mocks.findProductSlugAlias.mockResolvedValue(null);

    const response = await GET(
      new Request("https://admin.example.com/api/store-id/products/missing", {
        headers: { Origin: "https://papeleriapdepapel.com" },
      }),
      { params: { storeId: "store-id", productId: "missing" } },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
  });

  it("hides archived products from storefront detail requests", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "archived-product-id",
      name: "Sello archivado",
      price: 12000,
      isArchived: true,
    });

    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products/sello-archivado?scope=storefront",
        { headers: { Origin: "https://papeleriapdepapel.com" } },
      ),
      { params: { storeId: "store-id", productId: "sello-archivado" } },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://papeleriapdepapel.com",
    );
    expect(mocks.findProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isArchived: false }),
      }),
    );
    expect(vi.mocked(handleErrorResponse)).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
      "PRODUCT_GET",
      expect.objectContaining({
        expectedStatusCodes: [404],
        logMetadata: {
          requestSource: "storefront",
          productReference: "sello-archivado",
        },
      }),
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

  it("answers anonymous callers through the public select, never a full row", async () => {
    await GET(
      new Request("https://admin.example.com/api/store-id/products/resaltador-lila?scope=storefront"),
      { params: { storeId: "store-id", productId: "resaltador-lila" } },
    );

    const query = mocks.findProduct.mock.calls[0][0];
    expect(query.include).toBeUndefined();
    expect(query.select).toEqual(
      expect.objectContaining({ id: true, price: true, images: expect.any(Object) }),
    );
    for (const field of ["acqPrice", "transportationCost", "supplierId", "supplier", "abcClassification"]) {
      expect(query.select).not.toHaveProperty(field);
    }
  });

  it("gives the store owner the full row the admin product picker relies on", async () => {
    mocks.auth.mockResolvedValue({ userId: "owner-1" });
    mocks.checkIfStoreOwner.mockResolvedValue(true);

    await GET(
      new Request("https://admin.example.com/api/store-id/products/product-id"),
      { params: { storeId: "store-id", productId: "product-id" } },
    );

    expect(mocks.checkIfStoreOwner).toHaveBeenCalledWith("owner-1", "store-id");
    const query = mocks.findProduct.mock.calls[0][0];
    expect(query.select).toBeUndefined();
    expect(query.include).toEqual(expect.objectContaining({ supplier: true, images: true }));
  });
});
