import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  productCreate: vi.fn(),
  productFindUnique: vi.fn(),
  productGroupFindFirst: vi.fn(),
  brandFindFirst: vi.fn(),
  transaction: vi.fn(),
  txProductUpdate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: vi.fn() } }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: vi.fn() } } } }));
vi.mock("@/lib/cloudinary-cleanup", () => ({ deleteCloudinaryImages: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: vi.fn(),
  storefrontScopeOf: async () => ({ tags: [], paths: [] }),
}));
vi.mock("@/lib/catalog-migration", () => ({
  syncProductCatalogAttributes: vi.fn(),
  visualCatalogAttributesSchema: { parse: (value: unknown) => value },
}));
vi.mock("@/lib/rich-text", () => ({ sanitizeRichTextHtml: (value: string) => value ?? "" }));
vi.mock("@/lib/variant-generator", () => ({ generateSemanticSKU: () => "SKU-TEST" }));
vi.mock("@/lib/slugify", () => ({ generateProductSlug: () => "producto" }));
vi.mock("@/lib/product-slugs", () => ({
  getUniqueProductSlug: vi.fn().mockResolvedValue("producto"),
  preserveProductSlugAlias: vi.fn(),
  synchronizeProductGroupSlugs: vi.fn(),
}));
vi.mock("@/lib/product-attributes", () => ({
  loadProductAttributes: vi.fn().mockResolvedValue({
    category: { id: "c1", name: "Cuadernos" },
    design: { id: "d1", name: "Liso" },
    color: { id: "k1", name: "Rosa" },
    size: { id: "s1", name: "Carta", value: "carta" },
  }),
}));
vi.mock("@/lib/variant-gallery", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  replaceOwnPhotos: vi.fn().mockResolvedValue(undefined),
  releaseGroupCopies: vi.fn().mockResolvedValue(undefined),
  switchVariantGroup: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { DYNAMIC: {}, NO_CACHE: {}, STATIC: {} },
  currencyFormatter: (value: number) => String(value),
  generateRandomSKU: vi.fn(),
  parseErrorDetails: vi.fn(),
  getPublicIdFromCloudinaryUrl: () => null,
}));
vi.mock("@/lib/server/utils", () => ({
  checkIfStoreOwner: vi.fn(),
  verifyStoreOwner: vi.fn(),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    $transaction: mocks.transaction,
    product: {
      create: mocks.productCreate,
      findUnique: mocks.productFindUnique,
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "new-1" }),
      findFirst: vi.fn(),
    },
    productGroup: { findFirst: mocks.productGroupFindFirst },
    brand: { findFirst: mocks.brandFindFirst },
    supplier: { findFirst: vi.fn() },
  },
}));

import { POST } from "@/app/api/[storeId]/products/route";
import { PATCH } from "@/app/api/[storeId]/products/[productId]/route";

const baseBody = {
  name: "Cuaderno de prueba",
  price: 10,
  acqPrice: 5,
  categoryId: "c1",
  colorId: "k1",
  sizeId: "s1",
  designId: "d1",
  images: [{ url: "https://res.cloudinary.com/test/a.jpg", isMain: true }],
  hasNoProductIdentifier: true,
};

const post = (extra: Record<string, unknown>) =>
  POST(
    new Request("https://admin.test/api/store-1/products", {
      method: "POST",
      body: JSON.stringify({ ...baseBody, ...extra }),
    }),
    { params: { storeId: "store-1" } },
  );

const patch = (extra: Record<string, unknown>) =>
  PATCH(
    new Request("https://admin.test/api/store-1/products/p1", {
      method: "PATCH",
      body: JSON.stringify({ ...baseBody, preserveSlug: true, ...extra }),
    }),
    { params: { storeId: "store-1", productId: "p1" } },
  );

const writtenData = () => mocks.productCreate.mock.calls[0][0].data;
const patchedData = () => mocks.txProductUpdate.mock.calls[0][0].data;

describe("product write paths and brands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.productCreate.mockResolvedValue({ id: "new-1" });
    mocks.brandFindFirst.mockResolvedValue({ name: "Marca A", isArchived: false });
    mocks.productGroupFindFirst.mockResolvedValue(null);
    mocks.productFindUnique.mockResolvedValue({
      id: "p1",
      slug: "producto",
      sku: "SKU-1",
      brandId: null,
      productGroupId: null,
      isKit: false,
      isArchived: false,
      images: [{ url: "https://res.cloudinary.com/test/a.jpg" }],
    });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        product: {
          update: mocks.txProductUpdate,
          findUnique: vi.fn().mockResolvedValue({ id: "p1", images: [] }),
        },
      }),
    );
  });

  it("POST saves the chosen brand of the store and never the old text column", async () => {
    const response = await post({ brandId: "brand-a", brand: "Texto viejo" });

    expect(response.status).toBe(200);
    expect(mocks.brandFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "brand-a", storeId: "store-1" } }),
    );
    expect(writtenData().brandId).toBe("brand-a");
    expect(writtenData()).not.toHaveProperty("brand");
  });

  it("POST answers 404 for a brand of another store", async () => {
    mocks.brandFindFirst.mockResolvedValue(null);

    const response = await post({ brandId: "brand-other-store" });

    expect(response.status).toBe(404);
    expect(mocks.productCreate).not.toHaveBeenCalled();
  });

  it("POST answers 409 for an archived brand", async () => {
    mocks.brandFindFirst.mockResolvedValue({ name: "Marca A", isArchived: true });

    const response = await post({ brandId: "brand-a" });

    expect(response.status).toBe(409);
    expect(mocks.productCreate).not.toHaveBeenCalled();
  });

  it("POST of a variant takes its group's brand, not the one sent", async () => {
    mocks.productGroupFindFirst.mockResolvedValue({ id: "group-1", brandId: "brand-group" });

    const response = await post({ brandId: "brand-a", productGroupId: "group-1" });

    expect(response.status).toBe(200);
    expect(writtenData().brandId).toBe("brand-group");
    expect(mocks.brandFindFirst).not.toHaveBeenCalled();
  });

  it("POST without brand saves «Sin marca»", async () => {
    await post({ brandId: "" });
    expect(writtenData().brandId).toBeNull();
  });

  it("PATCH keeps an archived brand the product already had", async () => {
    mocks.productFindUnique.mockResolvedValue({
      ...(await mocks.productFindUnique()),
      brandId: "brand-archived",
    });
    mocks.brandFindFirst.mockResolvedValue({ name: "Marca vieja", isArchived: true });

    const response = await patch({ brandId: "brand-archived" });

    expect(response.status).toBe(200);
    expect(patchedData().brandId).toBe("brand-archived");
    expect(patchedData()).not.toHaveProperty("brand");
  });

  it("PATCH refuses to switch to an archived brand", async () => {
    mocks.brandFindFirst.mockResolvedValue({ name: "Marca vieja", isArchived: true });

    const response = await patch({ brandId: "brand-archived" });

    expect(response.status).toBe(409);
    expect(mocks.txProductUpdate).not.toHaveBeenCalled();
  });

  it("PATCH without brandId in the body leaves the brand untouched", async () => {
    const response = await patch({});

    expect(response.status).toBe(200);
    expect(patchedData()).not.toHaveProperty("brandId");
  });

  it("PATCH moving a product into a group gives it the group's brand", async () => {
    mocks.productGroupFindFirst.mockResolvedValue({ id: "group-1", brandId: "brand-group" });

    const response = await patch({ brandId: "brand-a", productGroupId: "group-1" });

    expect(response.status).toBe(200);
    expect(patchedData().brandId).toBe("brand-group");
  });
});
