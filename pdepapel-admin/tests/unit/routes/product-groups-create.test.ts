import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  productCreate: vi.fn(),
  productUpdate: vi.fn(),
}));

// La ruta ahora borra fotos en Cloudinary después de confirmar; aquí no se prueba.
vi.mock("@/lib/cloudinary-cleanup", () => ({
  deleteCloudinaryImages: vi.fn().mockResolvedValue({ deleted: 0, kept: 0 }),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: vi.fn() }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/product-slugs", () => ({
  synchronizeProductGroupSlugs: vi.fn(),
  getUniqueProductSlug: vi.fn().mockResolvedValue("cartuchera-kawaii-lila"),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    product: { findMany: mocks.findMany },
    // Fotos previas del producto adoptado (se borran de Cloudinary al final).
    image: { findMany: vi.fn().mockResolvedValue([]) },
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
  category: { findFirst: vi.fn().mockResolvedValue({ id: "cat-1" }) },
  color: { findMany: vi.fn().mockResolvedValue([attribute("c1", "Rosa")]) },
  design: { findMany: vi.fn().mockResolvedValue([attribute("d1", "Panda")]) },
  size: { findMany: vi.fn().mockResolvedValue([attribute("s1", "Única")]) },
  product: {
    create: mocks.productCreate,
    update: mocks.productUpdate,
    // Adopción: el producto suelto existe en la tienda, no es kit ni está archivado.
    findMany: vi.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map((id: string) => ({ id, storeId: "store-1", name: "Cartuchera Kawaii lila", slug: "x", sku: "SKU", isKit: false, isArchived: false, productGroupId: null, createdAt: new Date() })),
    ),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  productSlugAlias: { findUnique: vi.fn().mockResolvedValue(null) },
  marketplaceListing: { findMany: vi.fn().mockResolvedValue([]) },
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

  /**
   * La portada de una variante con fotos propias.
   *
   * Una variante que trae sus propias fotos (adoptada con «Traer existentes»,
   * o editada aparte) pasaba por aquí sin ninguna marcada como portada, y se
   * guardaba así: sin portada. Luego cada pantalla elegía una distinta y a
   * Paula le «cambiaba» la foto del producto al guardar el grupo por
   * cualquier motivo, aunque solo hubiera entrado a ponerle stock.
   */
  describe("portada de la variante", () => {
    /**
     * Una variante nueva guarda sus fotos anidadas en `product.create`; una
     * que ya existía las reescribe con `image.createMany`. Se miran las dos
     * para no depender de por cuál de los dos caminos entró.
     */
    type Foto = { url: string; isMain: boolean };
    const fotosGuardadas = (): Foto[][] => {
      const deCreate = mocks.productCreate.mock.calls.map((llamada: unknown[]) => {
        const arg = llamada[0] as { data?: { images?: { createMany?: { data?: Foto[] } } } };
        return arg?.data?.images?.createMany?.data ?? [];
      });
      const deImagen = tx.image.createMany.mock.calls.map((llamada: unknown[]) => {
        const arg = llamada[0] as { data?: Foto[] };
        return arg?.data ?? [];
      });
      return [...deCreate, ...deImagen].filter((d: Foto[]) => d.length > 0);
    };

    it("con fotos propias sin marcar, asciende la primera", async () => {
      await call([variant({ images: ["propia-1.jpg", "propia-2.jpg"] })]);

      const guardadas = fotosGuardadas().at(-1)!;
      expect(guardadas.map((i) => i.url)).toEqual(["propia-1.jpg", "propia-2.jpg"]);
      expect(guardadas.filter((i) => i.isMain)).toHaveLength(1);
      expect(guardadas[0].isMain).toBe(true);
    });

    it("si la variante ya dice cuál es su portada, se respeta", async () => {
      await call([
        variant({
          images: [
            { url: "propia-1.jpg", isMain: false },
            { url: "propia-2.jpg", isMain: true },
          ],
        }),
      ]);

      const guardadas = fotosGuardadas().at(-1)!;
      expect(guardadas.find((i) => i.isMain)?.url).toBe("propia-2.jpg");
      expect(guardadas.filter((i) => i.isMain)).toHaveLength(1);
    });

    it("sin fotos propias, hereda las del grupo y conserva su portada", async () => {
      await call([variant()]);

      const guardadas = fotosGuardadas().at(-1)!;
      expect(guardadas.filter((i) => i.isMain)).toHaveLength(1);
      expect(guardadas.find((i) => i.isMain)?.url).toBe(
        "https://res.cloudinary.com/test/c.jpg",
      );
    });
  });
});
