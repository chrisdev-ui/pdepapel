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

describe("«Excepción de margen» en las rutas de producto", () => {
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
      marginExceptionReason: null,
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

  it("POST con motivo lo recorta y sella cuándo y quién (la sesión, nunca el cuerpo)", async () => {
    const response = await post({ marginExceptionReason: "  Precio competitivo  ", marginExceptionBy: "otra", marginExceptionAt: "2020-01-01" });

    expect(response.status).toBe(200);
    expect(writtenData()).toMatchObject({ marginExceptionReason: "Precio competitivo", marginExceptionBy: "owner" });
    expect(writtenData().marginExceptionAt).toBeInstanceOf(Date);
    expect(writtenData().marginExceptionAt.getFullYear()).toBeGreaterThan(2020);
  });

  it("POST sin motivo (o vacío) no escribe la excepción", async () => {
    await post({});
    expect(writtenData()).not.toHaveProperty("marginExceptionReason");
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.productCreate.mockResolvedValue({ id: "new-1" });
    await post({ marginExceptionReason: "   " });
    expect(writtenData()).not.toHaveProperty("marginExceptionAt");
  });

  it.each([["ab"], ["x".repeat(256)], [42]])("rechaza un motivo inválido (%s) sin escribir", async (reason) => {
    expect((await post({ marginExceptionReason: reason })).status).toBe(400);
    expect(mocks.productCreate).not.toHaveBeenCalled();
    expect((await patch({ marginExceptionReason: reason })).status).toBe(400);
    expect(mocks.txProductUpdate).not.toHaveBeenCalled();
  });

  it("PATCH con un motivo nuevo lo guarda y sella", async () => {
    const response = await patch({ marginExceptionReason: "Estrategia de volumen" });

    expect(response.status).toBe(200);
    expect(patchedData()).toMatchObject({ marginExceptionReason: "Estrategia de volumen", marginExceptionBy: "owner" });
    expect(patchedData().marginExceptionAt).toBeInstanceOf(Date);
  });

  it("PATCH con el mismo motivo no vuelve a sellar", async () => {
    mocks.productFindUnique.mockResolvedValue({ ...(await mocks.productFindUnique()), marginExceptionReason: "Volumen" });

    await patch({ marginExceptionReason: " Volumen " });

    expect(patchedData()).not.toHaveProperty("marginExceptionReason");
    expect(patchedData()).not.toHaveProperty("marginExceptionAt");
    expect(patchedData()).not.toHaveProperty("marginExceptionBy");
  });

  it("PATCH con null o vacío quita las tres columnas", async () => {
    mocks.productFindUnique.mockResolvedValue({ ...(await mocks.productFindUnique()), marginExceptionReason: "Volumen" });

    await patch({ marginExceptionReason: "" });

    expect(patchedData()).toMatchObject({ marginExceptionReason: null, marginExceptionAt: null, marginExceptionBy: null });
  });

  it("PATCH sin el campo no toca la excepción (otras rutas y scripts no lo mandan)", async () => {
    mocks.productFindUnique.mockResolvedValue({ ...(await mocks.productFindUnique()), marginExceptionReason: "Volumen" });

    await patch({});

    expect(patchedData()).not.toHaveProperty("marginExceptionReason");
    expect(patchedData()).not.toHaveProperty("marginExceptionAt");
  });
});
