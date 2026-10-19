import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DUPLICATE_VARIANT_MESSAGE } from "@/lib/variant-combinations";

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
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: vi.fn() } } } }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/**
 * La ficha avisa «Esta combinación ya existe en este grupo», pero el servidor
 * no lo comprobaba: con el aviso saltado (otra pestaña, una petición directa)
 * se guardaban dos variantes iguales. Ahora crear, editar y guardar el grupo
 * responden con un 4xx que el formulario muestra.
 */
describe("duplicate variant combination is refused by the server", () => {
  let fixture: InventoryFixture | undefined;
  let groupId = "";
  let otherColorId = "";

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      const storeId = fixture.store.id;
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId } });
      await testPrisma.image.deleteMany({ where: { product: { storeId } } });
      await testPrisma.product.deleteMany({ where: { storeId, id: { notIn: [fixture.component.id, fixture.kit.id] } } });
      await testPrisma.product.update({ where: { id: fixture.component.id }, data: { productGroupId: null } });
      await testPrisma.productGroup.deleteMany({ where: { id: groupId } });
      await testPrisma.color.deleteMany({ where: { id: otherColorId } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** El componente del fixture queda como variante de un grupo nuevo. */
  async function setUp() {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const suffix = randomUUID().slice(0, 8);
    groupId = (await testPrisma.productGroup.create({ data: { storeId: fixture.store.id, name: `Grupo ${suffix}`, description: "" } as never })).id;
    otherColorId = (await testPrisma.color.create({ data: { storeId: fixture.store.id, name: `Azul ${suffix}`, value: "#0000ff" } as never })).id;
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { productGroupId: groupId } });
    return testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
  }

  function body(product: { price: number; acqPrice: number | null; categoryId: string; sizeId: string; colorId: string; designId: string }, overrides: Record<string, unknown> = {}) {
    return {
      name: `Variante ${randomUUID().slice(0, 6)}`,
      price: product.price,
      acqPrice: product.acqPrice,
      categoryId: product.categoryId,
      sizeId: product.sizeId,
      colorId: product.colorId,
      designId: product.designId,
      description: "Producto de pruebas",
      images: [{ url: "https://images.test/variante.jpg", isMain: true }],
      productGroupId: groupId,
      preserveSlug: true,
      hasNoProductIdentifier: true,
      ...overrides,
    };
  }

  it("crear una variante con la combinación de otra del grupo responde 409 y no escribe; con otro color sí se crea", async () => {
    const existing = await setUp();
    const { POST } = await import("@/app/api/[storeId]/products/route");
    const params = { params: { storeId: fixture!.store.id } };

    const blocked = await POST(json("POST", body(existing)), params);
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain(DUPLICATE_VARIANT_MESSAGE);
    await expect(testPrisma.product.count({ where: { productGroupId: groupId } })).resolves.toBe(1);

    const ok = await POST(json("POST", body(existing, { colorId: otherColorId })), params);
    expect(ok.status).toBe(200);
    await expect(testPrisma.product.count({ where: { productGroupId: groupId } })).resolves.toBe(2);
  });

  it("archivada también cuenta, como en el aviso del formulario", async () => {
    const existing = await setUp();
    await testPrisma.product.update({ where: { id: existing.id }, data: { isArchived: true } });
    const { POST } = await import("@/app/api/[storeId]/products/route");
    const blocked = await POST(json("POST", body(existing)), { params: { storeId: fixture!.store.id } });
    expect(blocked.status).toBe(409);
  });

  it("editar una variante hacia la combinación de otra responde 409; editar sin cambiarla no se bloquea", async () => {
    const existing = await setUp();
    const { POST } = await import("@/app/api/[storeId]/products/route");
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    expect((await POST(json("POST", body(existing, { colorId: otherColorId })), { params: { storeId: fixture!.store.id } })).status).toBe(200);
    const sibling = await testPrisma.product.findFirstOrThrow({ where: { productGroupId: groupId, colorId: otherColorId } });
    const params = { params: { storeId: fixture!.store.id, productId: sibling.id } };

    const blocked = await PATCH(json("PATCH", body(sibling, { name: sibling.name, colorId: existing.colorId })), params);
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain(DUPLICATE_VARIANT_MESSAGE);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: sibling.id } })).resolves.toMatchObject({ colorId: otherColorId });

    // Un duplicado que ya existía (datos viejos) se sigue pudiendo editar.
    await testPrisma.product.update({ where: { id: sibling.id }, data: { colorId: existing.colorId } });
    const priceOnly = await PATCH(json("PATCH", body({ ...sibling, colorId: existing.colorId }, { name: sibling.name, price: sibling.price + 500 })), params);
    expect(priceOnly.status).toBe(200);
  });

  it("mover un producto suelto a un grupo donde su combinación ya existe responde 409", async () => {
    const existing = await setUp();
    const { PATCH } = await import("@/app/api/[storeId]/products/[productId]/route");
    const loose = await testPrisma.product.create({
      data: { ...body(existing), productGroupId: null, images: undefined, preserveSlug: undefined, storeId: fixture!.store.id, slug: `suelto-${randomUUID().slice(0, 8)}`, sku: `SUE-${randomUUID().slice(0, 8)}` } as never,
    });
    const moved = await PATCH(json("PATCH", body(loose, { name: loose.name })), { params: { storeId: fixture!.store.id, productId: loose.id } });
    expect(moved.status).toBe(409);
    await expect(testPrisma.product.findUniqueOrThrow({ where: { id: loose.id } })).resolves.toMatchObject({ productGroupId: null });
  });

  it("guardar el grupo con dos filas de la misma combinación responde 400", async () => {
    const existing = await setUp();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const row = { sizeId: existing.sizeId, colorId: existing.colorId, designId: existing.designId, price: existing.price };
    const response = await PATCH(
      json("PATCH", { name: "Grupo", images: [{ url: "https://images.test/grupo.jpg" }], categoryId: existing.categoryId, variants: [{ ...row, id: existing.id }, row] }),
      { params: { storeId: fixture!.store.id, productGroupId: groupId } },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/misma combinación/);
    await expect(testPrisma.product.count({ where: { productGroupId: groupId } })).resolves.toBe(1);
  });
});
