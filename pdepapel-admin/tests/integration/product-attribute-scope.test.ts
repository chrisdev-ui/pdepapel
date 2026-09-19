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

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/**
 * Auditoría de Atributos (2026-09-19): crear o guardar un producto buscaba la
 * subcategoría, el color, el tamaño y el diseño solo por id, así que un id de
 * otra tienda se colgaba del producto. Ahora responde 400 y no escribe nada.
 */
describe("product routes validate attributes within the store", () => {
  let fixture: InventoryFixture | undefined;
  let other: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    for (const f of [fixture, other]) {
      if (!f) continue;
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId: f.store.id } });
      await testPrisma.image.deleteMany({ where: { product: { storeId: f.store.id } } });
      await testPrisma.product.deleteMany({ where: { storeId: f.store.id, id: { notIn: [f.component.id, f.kit.id] } } });
      await deleteInventoryFixture(f);
    }
    fixture = undefined;
    other = undefined;
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function body(f: InventoryFixture, overrides: Record<string, unknown> = {}) {
    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } });
    return {
      name: "Agenda de pruebas",
      price: product.price,
      acqPrice: product.acqPrice,
      categoryId: product.categoryId,
      sizeId: product.sizeId,
      colorId: product.colorId,
      designId: product.designId,
      description: product.description,
      images: [{ url: "https://images.test/componente.jpg", isMain: true }],
      preserveSlug: true,
      hasNoProductIdentifier: true,
      ...overrides,
    };
  }

  it("rejects a colour from another store on update and on create", async () => {
    fixture = await createInventoryFixture();
    other = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const foreign = await testPrisma.product.findUniqueOrThrow({ where: { id: other.component.id } });

    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const patched = await PATCH(json("PATCH", await body(fixture, { colorId: foreign.colorId })), {
      params: { storeId: fixture.store.id, productId: fixture.component.id },
    });
    expect(patched.status).toBe(400);
    expect(await patched.text()).toMatch(/el color de otra tienda/);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).resolves.toMatchObject({ colorId: fixture.component.colorId });

    const { POST } = await import("@/app/api/[storeId]/products/route");
    const created = await POST(json("POST", await body(fixture, { designId: foreign.designId, sizeId: foreign.sizeId })), {
      params: { storeId: fixture.store.id },
    });
    expect(created.status).toBe(400);
    expect(await created.text()).toMatch(/el diseño, el tamaño de otra tienda/);
    await expect(testPrisma.product.count({ where: { storeId: fixture.store.id } })).resolves.toBe(2);

    const ok = await POST(json("POST", await body(fixture)), { params: { storeId: fixture.store.id } });
    expect(ok.status).toBe(200);
  });
});
