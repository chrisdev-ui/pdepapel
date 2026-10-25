import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ CACHE_HEADERS: { NO_CACHE: {} } }));
vi.mock("@/lib/server/utils", () => ({ verifyStoreOwner: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: vi.fn(),
  storefrontScopeOf: async () => ({ tags: [], paths: [] }),
}));
vi.mock("@/lib/cloudinary-cleanup", () => ({ deleteCloudinaryImages: vi.fn() }));
vi.mock("@/lib/product-group-conflicts", () => ({ assertNoStandaloneConflicts: vi.fn() }));
vi.mock("@/lib/product-archive", () => ({ pauseMarketplaceListingsForProducts: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/product-slugs", () => ({
  synchronizeProductGroupSlugs: vi.fn(),
  getUniqueProductSlug: vi.fn().mockResolvedValue("variante"),
  deleteGroupedVariantKeepingUrls: vi.fn(),
}));
vi.mock("@/lib/variant-gallery", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  syncVariantGallery: vi.fn(),
  writeGroupPhotos: vi.fn(),
}));
vi.mock("@/lib/product-group-attributes", () => ({
  assertStoreCategory: vi.fn(),
  loadVariantAttributes: vi.fn().mockResolvedValue({
    resolve: () => ({
      colorObj: { id: "c1", name: "Rosa" },
      designObj: { id: "d1", name: "Liso" },
      sizeObj: { id: "s1", name: "Única", value: "unica" },
    }),
    categoryFallback: () => "cat-1",
  }),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: vi.fn().mockResolvedValue([]) },
    image: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/[storeId]/product-groups/route";
import { PATCH } from "@/app/api/[storeId]/product-groups/[productGroupId]/route";

const existingVariant = {
  id: "v1",
  storeId: "store-1",
  name: "Cuaderno rosa",
  slug: "cuaderno-rosa",
  sku: "CUA-1",
  isKit: false,
  isArchived: false,
  productGroupId: "group-1",
  categoryId: "cat-1",
  transportationCost: null,
  createdAt: new Date("2026-01-01"),
};

function makeTx(brand: { name: string; isArchived: boolean } | null) {
  return {
    brand: { findFirst: vi.fn().mockResolvedValue(brand) },
    productGroup: {
      create: vi.fn().mockResolvedValue({ id: "group-new", name: "Cuaderno" }),
      findFirst: vi.fn().mockResolvedValue({ id: "group-1", slug: "cuaderno", brandId: "brand-old" }),
      update: vi.fn().mockResolvedValue({ id: "group-1", name: "Cuaderno" }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([existingVariant]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "v-new" }),
      update: vi.fn().mockResolvedValue({ id: "v1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
}

let tx = makeTx({ name: "Marca A", isArchived: false });

const variants = [
  { id: "v1", sku: "CUA-1", sizeId: "s1", colorId: "c1", designId: "d1" },
  { sku: "CUA-2", name: "Cuaderno azul", sizeId: "s1", colorId: "c2", designId: "d1" },
];

const body = (extra: Record<string, unknown>) =>
  JSON.stringify({
    name: "Cuaderno",
    categoryId: "cat-1",
    images: [{ url: "https://res.cloudinary.com/test/c.jpg", isMain: true }],
    defaultPrice: 10,
    variants,
    ...extra,
  });

const post = (extra: Record<string, unknown>) =>
  POST(new Request("https://admin.test/api/store-1/product-groups", { method: "POST", body: body(extra) }), {
    params: { storeId: "store-1" },
  });

const patch = (extra: Record<string, unknown>) =>
  PATCH(
    new Request("https://admin.test/api/store-1/product-groups/group-1", {
      method: "PATCH",
      body: body({ preserveSlug: true, confirmRemovals: true, ...extra }),
    }),
    { params: { storeId: "store-1", productGroupId: "group-1" } },
  );

describe("product groups write one brand for the group and every variant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    tx = makeTx({ name: "Marca A", isArchived: false });
    mocks.transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
  });

  it("POST writes the brand on the group, the adopted variant and the new one", async () => {
    tx.product.findMany.mockResolvedValue([{ ...existingVariant, productGroupId: null }]);
    const response = await post({ brandId: "brand-a", brand: "Texto viejo" });

    expect(response.status).toBe(200);
    expect(tx.productGroup.create.mock.calls[0][0].data.brandId).toBe("brand-a");
    expect(tx.productGroup.create.mock.calls[0][0].data).not.toHaveProperty("brand");
    expect(tx.product.update.mock.calls[0][0].data.brandId).toBe("brand-a");
    expect(tx.product.create.mock.calls[0][0].data.brandId).toBe("brand-a");
  });

  it("POST answers 409 for an archived brand and creates nothing", async () => {
    tx = makeTx({ name: "Marca A", isArchived: true });

    const response = await post({ brandId: "brand-a" });

    expect(response.status).toBe(409);
    expect(tx.productGroup.create).not.toHaveBeenCalled();
  });

  it("PATCH writes the new brand on the group and on every variant still in it", async () => {
    const response = await patch({ brandId: "brand-a" });

    expect(response.status).toBe(200);
    expect(tx.productGroup.update.mock.calls[0][0].data.brandId).toBe("brand-a");
    expect(tx.product.update.mock.calls[0][0].data.brandId).toBe("brand-a");
    expect(tx.product.create.mock.calls[0][0].data.brandId).toBe("brand-a");
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { productGroupId: "group-1", storeId: "store-1" },
      data: { brandId: "brand-a" },
    });
  });

  it("PATCH without brandId keeps the group's brand (even archived) and re-applies it to the variants", async () => {
    tx = makeTx({ name: "Marca vieja", isArchived: true });

    const response = await patch({});

    expect(response.status).toBe(200);
    expect(tx.productGroup.update.mock.calls[0][0].data.brandId).toBe("brand-old");
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { brandId: "brand-old" } }),
    );
  });

  it("PATCH with «Sin marca» clears the group and its variants", async () => {
    const response = await patch({ brandId: null });

    expect(response.status).toBe(200);
    expect(tx.brand.findFirst).not.toHaveBeenCalled();
    expect(tx.productGroup.update.mock.calls[0][0].data.brandId).toBeNull();
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { brandId: null } }));
  });
});
