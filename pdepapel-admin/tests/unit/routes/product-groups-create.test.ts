import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  productCreate: vi.fn(),
  productUpdate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/product-slugs", () => ({
  synchronizeProductGroupSlugs: vi.fn(),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/[storeId]/product-groups/route";

const attribute = (id: string, name: string) => ({
  id,
  name,
  value: name.toLowerCase(),
});

const tx = {
  productGroup: {
    create: vi.fn().mockResolvedValue({ id: "group-1", name: "Cartuchera" }),
  },
  color: { findUnique: vi.fn().mockResolvedValue(attribute("c1", "Rosa")) },
  design: { findUnique: vi.fn().mockResolvedValue(attribute("d1", "Panda")) },
  size: { findUnique: vi.fn().mockResolvedValue(attribute("s1", "Única")) },
  product: { create: mocks.productCreate, update: mocks.productUpdate },
  image: { deleteMany: vi.fn(), createMany: vi.fn() },
};

const body = (variants: Record<string, unknown>[]) =>
  JSON.stringify({
    name: "Cartuchera",
    categoryId: "cat-1",
    images: [{ url: "https://res.cloudinary.com/test/c.jpg", isMain: true }],
    defaultPrice: 15000,
    variants,
  });

const call = (variants: Record<string, unknown>[]) =>
  POST(
    new Request("https://admin.test/api/store-1/product-groups", {
      method: "POST",
      body: body(variants),
    }),
    {
      params: { storeId: "store-1" },
    },
  );

const variant = (extra: Record<string, unknown> = {}) => ({
  name: "Cartuchera lucky girls",
  sku: "CLG-1",
  sizeId: "s1",
  colorId: "c1",
  designId: "d1",
  ...extra,
});

describe("POST /product-groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.transaction.mockImplementation(
      async (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    mocks.productCreate.mockResolvedValue({ id: "new-1" });
    mocks.productUpdate.mockResolvedValue({ id: "p-existing" });
  });

  it("answers 409 instead of duplicating a standalone product with the same name", async () => {
    mocks.findMany
      .mockResolvedValueOnce([
        { id: "p-existing", name: "Cartuchera Lucky Girls", sku: "CLG-0" },
      ])
      .mockResolvedValueOnce([]);

    const response = await call([variant()]);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining("«Cartuchera Lucky Girls»"),
      details: {
        code: "STANDALONE_PRODUCT_EXISTS",
        conflicts: [
          {
            id: "p-existing",
            name: "Cartuchera Lucky Girls",
            sku: "CLG-0",
            reason: "name",
            variant: "Cartuchera lucky girls",
          },
        ],
      },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.productCreate).not.toHaveBeenCalled();
  });

  it("answers 409 for a different name whose photos are exactly a standalone product's", async () => {
    const urls = [
      "https://res.cloudinary.com/test/a.jpg",
      "https://res.cloudinary.com/test/b.jpg",
    ];
    mocks.findMany
      .mockResolvedValueOnce([]) // por nombre: nada
      .mockResolvedValueOnce([
        {
          id: "p-lucky",
          name: "Cartuchera Lucky Girls",
          sku: "CLG-0",
          images: urls.map((url) => ({ url })),
        },
      ]);

    const response = POST(
      new Request("https://admin.test/api/store-1/product-groups", {
        method: "POST",
        body: JSON.stringify({
          name: "Cartuchera Kawaii",
          categoryId: "cat-1",
          images: urls.map((url) => ({ url })),
          defaultPrice: 15000,
          variants: [variant({ name: "Cartuchera Kawaii lila" })],
        }),
      }),
      { params: { storeId: "store-1" } },
    );
    const result = await response;

    expect(result.status).toBe(409);
    await expect(result.json()).resolves.toMatchObject({
      error: expect.stringContaining("mismas fotos"),
      details: {
        code: "STANDALONE_PRODUCT_EXISTS",
        conflicts: [
          {
            id: "p-lucky",
            name: "Cartuchera Lucky Girls",
            sku: "CLG-0",
            reason: "images",
            variant: "Cartuchera Kawaii lila",
          },
        ],
      },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("still adopts a variant that carries an id, even if it is that same standalone product", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "p-existing", name: "Cartuchera lucky girls", sku: "CLG-0" },
    ]);

    const response = await call([variant({ id: "p-existing" })]);

    expect(response.status).toBe(200);
    expect(mocks.productUpdate).toHaveBeenCalledTimes(1);
    const update = mocks.productUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: "p-existing", storeId: "store-1" });
    expect(update.data.productGroupId).toBe("group-1");
    expect(update.data).not.toHaveProperty("stock");
    expect(mocks.productCreate).not.toHaveBeenCalled();
  });

  it("creates a new variant when no standalone product shares its name", async () => {
    mocks.findMany.mockResolvedValue([]);

    const response = await call([variant()]);

    expect(response.status).toBe(200);
    expect(mocks.productCreate).toHaveBeenCalledTimes(1);
    expect(mocks.productCreate.mock.calls[0][0].data).toMatchObject({
      name: "Cartuchera lucky girls",
      productGroupId: "group-1",
      stock: 0,
    });
  });
});
