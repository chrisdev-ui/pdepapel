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
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const VALID_GTIN = "7701234567897";

/** Reglas de la ficha (Productos 2A): precio bajo costo, GTIN repetido, URL con alias, envío sin inventar. */
describe("product form rules with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.image.deleteMany({ where: { productId: { in: [fixture.component.id, fixture.kit.id] } } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function patchBody(overrides: Record<string, unknown> = {}) {
    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture!.component.id } });
    return {
      name: product.name,
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

  it("refuses a sale price below cost unless the owner says it is on purpose", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const params = { params: { storeId: fixture.store.id, productId: fixture.component.id } };

    const blocked = await PATCH(json("PATCH", await patchBody({ price: 3000 })), params);
    expect(blocked.status).toBe(400);
    expect(await blocked.text()).toMatch(/por debajo del costo/);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).resolves.toMatchObject({ price: 10000 });

    const allowed = await PATCH(json("PATCH", await patchBody({ price: 3000, allowBelowCost: true })), params);
    expect(allowed.status).toBe(200);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).resolves.toMatchObject({ price: 3000 });
  });

  it("rejects a GTIN that another product of the store already has, and a bad check digit", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await testPrisma.product.update({ where: { id: fixture.kit.id }, data: { gtin: VALID_GTIN, hasNoProductIdentifier: false } });
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const params = { params: { storeId: fixture.store.id, productId: fixture.component.id } };

    const duplicate = await PATCH(json("PATCH", await patchBody({ gtin: VALID_GTIN, hasNoProductIdentifier: false })), params);
    expect(duplicate.status).toBe(409);
    expect(await duplicate.text()).toContain("Kit");

    const badCheck = await PATCH(json("PATCH", await patchBody({ gtin: "7701234567890", hasNoProductIdentifier: false })), params);
    expect(badCheck.status).toBe(400);
  });

  it("keeps the URL by default and, when asked, changes it leaving the old one as an alias", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const before = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const params = { params: { storeId: fixture.store.id, productId: fixture.component.id } };

    const kept = await PATCH(json("PATCH", await patchBody({ name: "Agenda floral" })), params);
    expect(kept.status).toBe(200);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).resolves.toMatchObject({ slug: before.slug });

    const changed = await PATCH(json("PATCH", await patchBody({ name: "Agenda floral", preserveSlug: false })), params);
    expect(changed.status).toBe(200);
    const after = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(after.slug).toBe("agenda-floral");
    await expect(
      testPrisma.productSlugAlias.findUnique({ where: { storeId_slug: { storeId: fixture.store.id, slug: before.slug } } }),
    ).resolves.toMatchObject({ productId: fixture.component.id });
  });

  it("leaves the shipping cost empty instead of stamping a default", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const params = { params: { storeId: fixture.store.id, productId: fixture.component.id } };
    const response = await PATCH(json("PATCH", await patchBody({ transportationCost: null })), params);
    expect(response.status).toBe(200);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).resolves.toMatchObject({ transportationCost: null });
  });
});
