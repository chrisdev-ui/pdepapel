import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProducts: vi.fn(),
  countProducts: vi.fn(),
  groupProducts: vi.fn(),
  findProductGroups: vi.fn(),
  getActiveOffers: vi.fn(),
  getProductsPrices: vi.fn(),
}));

vi.mock("@/constants", () => ({
  SORT_OPTIONS: {
    default: { createdAt: "desc" },
    dateAdded: { createdAt: "desc" },
    priceLowToHigh: { price: "asc" },
    priceHighToLow: { price: "desc" },
    name: { name: "asc" },
    featuredFirst: { isFeatured: "desc" },
  },
}));
vi.mock("@/lib/api-errors", () => ({
  ErrorFactory: { MissingStoreId: vi.fn() },
  handleErrorResponse: (error: unknown) => {
    throw error;
  },
}));
vi.mock("@/lib/cloudinary", () => ({ default: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: {
      findMany: mocks.findProducts,
      count: mocks.countProducts,
      groupBy: mocks.groupProducts,
    },
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
  getActiveOffers: mocks.getActiveOffers,
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
    mocks.countProducts.mockResolvedValue(1);
    mocks.groupProducts.mockResolvedValue([]);
    mocks.getActiveOffers.mockResolvedValue([]);
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

  it("prioritizes discounted grouped products when sorting by offers", async () => {
    const discountedVariant = {
      ...standaloneProduct,
      id: "discounted-variant",
      slug: "lapiceros-en-oferta",
      price: 20000,
      stock: 3,
      isFeatured: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      reviews: [],
    };
    const regularProduct = {
      ...standaloneProduct,
      id: "regular-product",
      slug: "cuaderno-nuevo",
      name: "Cuaderno nuevo",
      price: 10000,
      isFeatured: false,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    };

    mocks.findProductGroups.mockResolvedValue([
      {
        id: "group-id",
        name: "Lapiceros en oferta",
        description: null,
        images: [],
        createdAt: discountedVariant.createdAt,
        products: [discountedVariant],
      },
    ]);
    mocks.findProducts.mockResolvedValue([regularProduct]);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [
          discountedVariant.id,
          {
            price: 16000,
            discount: 4000,
            offerLabel: "Oferta especial",
          },
        ],
        [
          regularProduct.id,
          {
            price: regularProduct.price,
            discount: 0,
            offerLabel: null,
          },
        ],
      ]),
    );

    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products?groupBy=parents&sortOption=isOnSale&skipCache=true",
      ),
      { params: { storeId: "store-id" } },
    );

    await expect(response.json()).resolves.toMatchObject({
      products: [
        { productGroupId: "group-id", hasDiscount: true },
        { id: regularProduct.id, hasDiscount: false },
      ],
    });
  });

  it("filters grouped catalog results to discounted products", async () => {
    const discountedVariant = {
      ...standaloneProduct,
      id: "discounted-variant",
      slug: "lapiceros-en-oferta",
      price: 20000,
      stock: 3,
      isFeatured: false,
      reviews: [],
    };
    const regularProduct = {
      ...standaloneProduct,
      id: "regular-product",
      slug: "cuaderno-nuevo",
      name: "Cuaderno nuevo",
      isFeatured: false,
    };

    mocks.findProductGroups.mockResolvedValue([
      {
        id: "group-id",
        name: "Lapiceros en oferta",
        description: null,
        images: [],
        createdAt: discountedVariant.createdAt,
        products: [discountedVariant],
      },
    ]);
    mocks.findProducts.mockResolvedValue([regularProduct]);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [
          discountedVariant.id,
          { price: 16000, discount: 4000, offerLabel: "Oferta especial" },
        ],
        [
          regularProduct.id,
          { price: regularProduct.price, discount: 0, offerLabel: null },
        ],
      ]),
    );

    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products?groupBy=parents&isOnSale=true&skipCache=true",
      ),
      { params: { storeId: "store-id" } },
    );

    await expect(response.json()).resolves.toMatchObject({
      totalItems: 1,
      products: [{ productGroupId: "group-id", hasDiscount: true }],
    });
  });

  it("keeps grouped card data aligned with the matching lowest-price variant", async () => {
    const lowestPriceVariant = {
      ...standaloneProduct,
      id: "lowest-price-variant",
      slug: "lapicero-azul",
      price: 10000,
      stock: 2,
      categoryId: "blue-category",
      category: { id: "blue-category", name: "Azul" },
      images: [{ id: "blue-image", url: "blue.jpg", isMain: true }],
      isFeatured: false,
      reviews: [],
    };
    mocks.findProductGroups.mockResolvedValue([
      {
        id: "group-id",
        name: "Lapiceros de colores",
        description: null,
        images: [],
        createdAt: lowestPriceVariant.createdAt,
        products: [lowestPriceVariant],
      },
    ]);
    mocks.findProducts.mockResolvedValue([]);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [
          lowestPriceVariant.id,
          { price: 10000, discount: 0, offerLabel: null },
        ],
      ]),
    );

    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products?groupBy=parents&colorId=blue&skipCache=true",
      ),
      { params: { storeId: "store-id" } },
    );

    await expect(response.json()).resolves.toMatchObject({
      products: [
        {
          id: lowestPriceVariant.id,
          slug: lowestPriceVariant.slug,
          categoryId: lowestPriceVariant.categoryId,
          images: lowestPriceVariant.images,
          stock: 2,
          minPrice: 10000,
          hasDiscount: false,
        },
      ],
    });
    expect(mocks.findProductGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          products: expect.objectContaining({
            where: expect.objectContaining({ colorId: { in: ["blue"] } }),
          }),
        }),
      }),
    );
  });

  it("sorts grouped catalog results by effective price", async () => {
    const groupVariant = {
      ...standaloneProduct,
      id: "group-variant",
      slug: "estuche-costoso",
      price: 30000,
      stock: 2,
      isFeatured: false,
      reviews: [],
    };
    const discountedStandaloneProduct = {
      ...standaloneProduct,
      id: "discounted-standalone",
      slug: "marcadores-en-oferta",
      name: "Marcadores en oferta",
      price: 20000,
      isFeatured: false,
    };

    mocks.findProductGroups.mockResolvedValue([
      {
        id: "group-id",
        name: "Estuche costoso",
        description: null,
        images: [],
        createdAt: groupVariant.createdAt,
        products: [groupVariant],
      },
    ]);
    mocks.findProducts.mockResolvedValue([discountedStandaloneProduct]);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [
          groupVariant.id,
          { price: groupVariant.price, discount: 0, offerLabel: null },
        ],
        [
          discountedStandaloneProduct.id,
          { price: 12000, discount: 8000, offerLabel: "Oferta especial" },
        ],
      ]),
    );

    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products?groupBy=parents&sortOption=priceLowToHigh&skipCache=true",
      ),
      { params: { storeId: "store-id" } },
    );

    await expect(response.json()).resolves.toMatchObject({
      products: [
        { id: discountedStandaloneProduct.id, price: 12000 },
        { productGroupId: "group-id", price: groupVariant.price },
      ],
    });
  });

  it.each([
    ["dateAdded", ["group-variant", "featured-product", "sale-product"]],
    ["priceLowToHigh", ["sale-product", "featured-product", "group-variant"]],
    ["priceHighToLow", ["group-variant", "featured-product", "sale-product"]],
    ["name", ["group-variant", "sale-product", "featured-product"]],
    ["featuredFirst", ["featured-product", "group-variant", "sale-product"]],
    ["isOnSale", ["sale-product", "group-variant", "featured-product"]],
  ])("applies %s across grouped catalog products", async (sortOption, ids) => {
    const groupVariant = {
      ...standaloneProduct,
      id: "group-variant",
      slug: "album-creativo",
      name: "Álbum creativo",
      price: 30000,
      stock: 2,
      isFeatured: false,
      createdAt: new Date("2026-03-03T00:00:00.000Z"),
      reviews: [],
    };
    const featuredProduct = {
      ...standaloneProduct,
      id: "featured-product",
      slug: "cuaderno-destacado",
      name: "Cuaderno destacado",
      price: 15000,
      isFeatured: true,
      createdAt: new Date("2026-03-02T00:00:00.000Z"),
    };
    const saleProduct = {
      ...standaloneProduct,
      id: "sale-product",
      slug: "borrador-en-oferta",
      name: "Borrador en oferta",
      price: 20000,
      isFeatured: false,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    };

    mocks.findProductGroups.mockResolvedValue([
      {
        id: "group-id",
        name: "Álbum creativo",
        description: null,
        images: [],
        createdAt: groupVariant.createdAt,
        products: [groupVariant],
      },
    ]);
    mocks.findProducts.mockResolvedValue([featuredProduct, saleProduct]);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [groupVariant.id, { price: 30000, discount: 0, offerLabel: null }],
        [featuredProduct.id, { price: 15000, discount: 0, offerLabel: null }],
        [
          saleProduct.id,
          { price: 10000, discount: 10000, offerLabel: "Oferta especial" },
        ],
      ]),
    );

    const response = await GET(
      new Request(
        `https://admin.example.com/api/store-id/products?groupBy=parents&sortOption=${sortOption}&skipCache=true`,
      ),
      { params: { storeId: "store-id" } },
    );
    const body = await response.json();

    expect(body.products.map((product: { id: string }) => product.id)).toEqual(
      ids,
    );
  });

  it.each([
    ["dateAdded", { createdAt: "desc" }],
    ["priceLowToHigh", { price: "asc" }],
    ["priceHighToLow", { price: "desc" }],
    ["name", { name: "asc" }],
    ["featuredFirst", { isFeatured: "desc" }],
  ])("applies %s to ungrouped catalog queries", async (sortOption, orderBy) => {
    const response = await GET(
      new Request(
        `https://admin.example.com/api/store-id/products?sortOption=${sortOption}&skipCache=true`,
      ),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.findProducts).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy }),
    );
  });

  it("prioritizes discounted standalone products when sorting by offers", async () => {
    const discountedProduct = {
      ...standaloneProduct,
      id: "discounted-product",
      slug: "marcadores-en-oferta",
      price: 12000,
    };
    const regularProduct = {
      ...standaloneProduct,
      id: "regular-product",
      slug: "cuaderno-regular",
    };

    mocks.getActiveOffers.mockResolvedValue([
      {
        products: [{ productId: discountedProduct.id }],
        categories: [],
        productGroups: [],
      },
    ]);
    mocks.findProducts
      .mockResolvedValueOnce([discountedProduct])
      .mockResolvedValueOnce([regularProduct]);
    mocks.countProducts.mockResolvedValue(1);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [
          discountedProduct.id,
          { price: 9000, discount: 3000, offerLabel: "Oferta especial" },
        ],
        [
          regularProduct.id,
          { price: regularProduct.price, discount: 0, offerLabel: null },
        ],
      ]),
    );

    const response = await GET(
      new Request(
        "https://admin.example.com/api/store-id/products?sortOption=isOnSale&skipCache=true",
      ),
      { params: { storeId: "store-id" } },
    );

    await expect(response.json()).resolves.toMatchObject({
      products: [{ id: discountedProduct.id }, { id: regularProduct.id }],
    });
  });
});
