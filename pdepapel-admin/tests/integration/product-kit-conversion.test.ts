import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: vi.fn() } } } }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));

const json = (body: unknown) =>
  new Request("http://admin.test/api/x", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * Pasar un producto a kit (o dejar de serlo) reescribía la columna de stock
 * fuera de la transacción y sin movimiento: 7 unidades físicas desaparecían
 * del kardex. Ahora queda un ajuste que lo explica y los componentes se
 * sueltan al deshacer el kit.
 */
describe("kit conversion keeps the inventory ledger honest", () => {
  let fixture: InventoryFixture | undefined;
  const extra: string[] = [];

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (extra.length > 0) {
      await testPrisma.productKit.deleteMany({ where: { OR: [{ kitId: { in: extra } }, { componentId: { in: extra } }] } });
      await testPrisma.inventoryMovement.deleteMany({ where: { productId: { in: extra } } });
      await testPrisma.image.deleteMany({ where: { productId: { in: extra } } });
      await testPrisma.product.deleteMany({ where: { id: { in: extra } } });
      extra.length = 0;
    }
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function createProduct(name: string, stock: number) {
    const base = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } });
    const product = await testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase()}-${randomUUID()}`,
        description: "x",
        stock,
        price: 20000,
        acqPrice: 5000,
        sku: `KIT-${randomUUID()}`,
        storeId: fixture!.store.id,
        categoryId: base.categoryId,
        colorId: base.colorId,
        sizeId: base.sizeId,
        designId: base.designId,
        images: { create: { url: `https://images.test/${name}.jpg`, isMain: true } },
      },
    });
    extra.push(product.id);
    return product;
  }

  const body = (product: { name: string; categoryId: string; sizeId: string; colorId: string; sizeId2?: string; designId: string; id: string }, overrides: Record<string, unknown>) => ({
    name: product.name,
    price: 20000,
    acqPrice: 5000,
    categoryId: product.categoryId,
    sizeId: product.sizeId,
    colorId: product.colorId,
    designId: product.designId,
    description: "x",
    images: [{ url: `https://images.test/${product.name}.jpg`, isMain: true }],
    preserveSlug: true,
    hasNoProductIdentifier: true,
    ...overrides,
  });

  it("records the adjustment when a product with physical stock becomes a kit, and frees the components when it stops being one", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const washi = await createProduct("Washi", 7);
    const product = await createProduct("Combo", 7);
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const params = { params: { storeId: fixture.store.id, productId: product.id } };

    const toKit = await PATCH(
      json(body(product, { isKit: true, components: [{ componentId: washi.id, quantity: 2 }] })),
      params,
    );
    expect(toKit.status).toBe(200);
    const asKit = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { kitComponents: true } });
    expect(asKit.isKit).toBe(true);
    expect(asKit.stock).toBe(3);
    expect(asKit.kitComponents).toHaveLength(1);
    const conversion = await testPrisma.inventoryMovement.findFirst({ where: { productId: product.id, reason: "Conversión a kit" } });
    expect(conversion).toMatchObject({ quantity: -4, previousStock: 7, newStock: 3 });

    const back = await PATCH(json(body(product, { isKit: false })), params);
    expect(back.status).toBe(200);
    const asProduct = await testPrisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { kitComponents: true } });
    expect(asProduct.isKit).toBe(false);
    expect(asProduct.stock).toBe(3);
    expect(asProduct.kitComponents).toHaveLength(0);
    await expect(
      testPrisma.inventoryMovement.findFirst({ where: { productId: product.id, reason: "Deja de ser kit" } }),
    ).resolves.toMatchObject({ quantity: 0, previousStock: 3, newStock: 3 });
  });

  it("refuses a kit that contains itself, another kit or an archived product", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const product = await createProduct("Combo2", 1);
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const params = { params: { storeId: fixture.store.id, productId: product.id } };

    const self = await PATCH(json(body(product, { isKit: true, components: [{ componentId: product.id, quantity: 1 }] })), params);
    expect(self.status).toBe(400);
    const nested = await PATCH(json(body(product, { isKit: true, components: [{ componentId: fixture.kit.id, quantity: 1 }] })), params);
    expect(nested.status).toBe(400);
    expect(await nested.text()).toMatch(/otro kit/);
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { isArchived: true } });
    const archived = await PATCH(json(body(product, { isKit: true, components: [{ componentId: fixture.component.id, quantity: 1 }] })), params);
    expect(archived.status).toBe(400);
    expect(await archived.text()).toMatch(/archivados/);
  });
});
