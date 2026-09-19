import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteResources: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  auth: vi.fn(),
  invalidate: vi.fn(),
  imageCount: vi.fn(),
  orderItemCount: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: mocks.invalidate }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: mocks.deleteResources } } } }));
vi.mock("@/lib/catalog-migration", () => ({
  syncProductCatalogAttributes: vi.fn(),
  visualCatalogAttributesSchema: { parse: (value: unknown) => value },
}));
vi.mock("@/lib/rich-text", () => ({ sanitizeRichTextHtml: (value: string) => value ?? "" }));
vi.mock("@/lib/variant-generator", () => ({ generateSemanticSKU: vi.fn() }));
vi.mock("@/lib/slugify", () => ({ generateProductSlug: () => "producto" }));
vi.mock("@/lib/product-slugs", () => ({
  getUniqueProductSlug: vi.fn(),
  preserveProductSlugAlias: vi.fn(),
  synchronizeProductGroupSlugs: vi.fn(),
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { DYNAMIC: {}, NO_CACHE: {} },
  checkIfStoreOwner: vi.fn(),
  verifyStoreOwner: vi.fn(),
  generateRandomSKU: vi.fn(),
  getPublicIdFromCloudinaryUrl: (url: string) => url.split("/").pop()?.replace(/\.\w+$/, "") ?? null,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    $transaction: mocks.transaction,
    product: { findUnique: mocks.findUnique },
    image: { count: mocks.imageCount },
    orderItem: { count: mocks.orderItemCount },
    supplier: { findFirst: vi.fn() },
    productGroup: { findFirst: vi.fn() },
    // Los atributos se buscan acotados a la tienda y deben existir (auditoría de Atributos).
    category: { findFirst: vi.fn().mockResolvedValue({ id: "c1", name: "Agendas" }) },
    design: { findFirst: vi.fn().mockResolvedValue({ id: "d1", name: "Kawaii" }) },
    color: { findFirst: vi.fn().mockResolvedValue({ id: "k1", name: "Rosa" }) },
    size: { findFirst: vi.fn().mockResolvedValue({ id: "s1", name: "S", value: "S-L" }) },
  },
}));

import { PATCH } from "@/app/api/[storeId]/products/[productId]/route";

const body = {
  name: "Libreta",
  price: 12000,
  acqPrice: 6000,
  categoryId: "c",
  colorId: "co",
  sizeId: "s",
  designId: "d",
  images: [{ url: "https://res.cloudinary.com/x/keep.jpg", isMain: true }],
  preserveSlug: true,
  hasNoProductIdentifier: true,
};

const request = () =>
  new Request("http://admin.test/api/store-1/products/p1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * Las fotos quitadas se borraban de Cloudinary DENTRO de la transacción: si
 * el guardado fallaba después, el archivo ya no existía pero la fila seguía.
 * Ahora el borrado sale solo cuando la base confirmó.
 */
describe("PATCH /products/[id] image cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageCount.mockResolvedValue(0);
    mocks.orderItemCount.mockResolvedValue(0);
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.findUnique.mockResolvedValue({
      id: "p1",
      slug: "libreta",
      sku: "LIB-1",
      productGroupId: null,
      isKit: false,
      stock: 3,
      kitComponents: [],
      images: [
        { url: "https://res.cloudinary.com/x/keep.jpg" },
        { url: "https://res.cloudinary.com/x/gone.jpg" },
      ],
    });
  });

  it("deletes the removed photo from Cloudinary only after the transaction commits", async () => {
    const order: string[] = [];
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        product: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ id: "p1", images: [] }), findFirst: vi.fn() },
        image: { deleteMany: vi.fn(), createMany: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        productKit: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
        marketplaceListing: { findMany: vi.fn().mockResolvedValue([]) },
        marketplaceOutboxEvent: { upsert: vi.fn() },
      };
      const result = await fn(tx);
      order.push("commit");
      return result;
    });
    mocks.deleteResources.mockImplementation(async () => {
      order.push("cloudinary");
    });

    const response = await PATCH(request(), { params: { storeId: "store-1", productId: "p1" } });
    expect(response.status).toBe(200);
    expect(mocks.deleteResources).toHaveBeenCalledWith(["gone"], expect.anything());
    expect(order).toEqual(["commit", "cloudinary"]);
  });

  it("keeps the file when the database update fails", async () => {
    mocks.transaction.mockRejectedValue(new Error("db down"));
    const response = await PATCH(request(), { params: { storeId: "store-1", productId: "p1" } });
    expect(response.status).toBe(500);
    expect(mocks.deleteResources).not.toHaveBeenCalled();
  });

  it("still saves when Cloudinary refuses: an orphan file beats a broken product", async () => {
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        product: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ id: "p1", images: [] }), findFirst: vi.fn() },
        image: { deleteMany: vi.fn(), createMany: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        productKit: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
        marketplaceListing: { findMany: vi.fn().mockResolvedValue([]) },
        marketplaceOutboxEvent: { upsert: vi.fn() },
      }),
    );
    mocks.deleteResources.mockRejectedValue(new Error("cloudinary 500"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await PATCH(request(), { params: { storeId: "store-1", productId: "p1" } });
    expect(response.status).toBe(200);
    errorSpy.mockRestore();
  });

  it("keeps a photo that another variant or an order still references", async () => {
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        product: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ id: "p1", images: [] }), findFirst: vi.fn() },
        image: { deleteMany: vi.fn(), createMany: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        productKit: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
        marketplaceListing: { findMany: vi.fn().mockResolvedValue([]) },
        marketplaceOutboxEvent: { upsert: vi.fn() },
      }),
    );
    mocks.imageCount.mockResolvedValue(1);
    const response = await PATCH(request(), { params: { storeId: "store-1", productId: "p1" } });
    expect(response.status).toBe(200);
    expect(mocks.deleteResources).not.toHaveBeenCalled();
  });
});
