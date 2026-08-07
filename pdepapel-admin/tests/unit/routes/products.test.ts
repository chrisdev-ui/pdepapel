import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProducts: vi.fn(),
  findProductGroups: vi.fn(),
  getProductsPrices: vi.fn(),
}));

vi.mock("@/constants", () => ({
  SORT_OPTIONS: { default: { createdAt: "desc" } },
}));
vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: { MissingStoreId: vi.fn() },
  handleErrorResponse: vi.fn(),
}));
vi.mock("@/lib/cloudinary", () => ({ default: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: mocks.findProducts },
    productGroup: { findMany: mocks.findProductGroups },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { DYNAMIC: { "Cache-Control": "public, max-age=60" } },
  generateRandomSKU: vi.fn(),
  getPublicIdFromCloudinaryUrl: vi.fn(),
  parseErrorDetails: vi.fn(),
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
  synchronizeProductGroupSlugs: vi.fn(),
}));
vi.mock("@/lib/discount-engine", () => ({
  getActiveOffers: vi.fn(),
  getProductsPrices: mocks.getProductsPrices,
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({ auth: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: vi.fn() } }));

import { GET } from "@/app/api/[storeId]/products/route";

const standaloneProduct = {
  id: "product-id",
  slug: "resaltadores-de-lectura",
  name: "Resaltadores de lectura",
  description: "Colores pastel",
  price: 12000,
  stock: 8,
  sku: "RES-001",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  images: [],
  category: { id: "category-id", name: "Resaltadores" },
  categoryId: "category-id",
  color: null,
  size: null,
  design: null,
};

describe("GET /api/[storeId]/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProductGroups.mockResolvedValue([]);
    mocks.findProducts.mockResolvedValue([standaloneProduct]);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [
          standaloneProduct.id,
          {
            price: standaloneProduct.price,
            discount: 0,
            offerLabel: null,
          },
        ],
      ]),
    );
  });

  it("returns canonical slugs for standalone catalog products", async () => {
    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products?groupBy=parents&skipCache=true",
      ),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      products: [
        {
          id: standaloneProduct.id,
          slug: standaloneProduct.slug,
        },
      ],
    });
  });

  it("returns canonical slugs when refreshing specific products", async () => {
    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products?ids=product-id&skipCache=true",
      ),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject([
      {
        id: standaloneProduct.id,
        slug: standaloneProduct.slug,
      },
    ]);
  });
});
