import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Guardar un grupo dos veces con el mismo borrador (otra pestaña, un borrador
 * restaurado) ya no choca con «Ya existe un registro»: el servidor revisa los
 * SKU antes de crear nada y contesta «Este grupo ya se guardó» con el grupo.
 * Un SKU de otro producto se nombra con su enlace. Sin filas a medias. Una
 * variante sin SKU recibe uno del servidor (cola de 6 en base 36).
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: vi.fn() } } } }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreOutboxEvent: vi.fn() }));

const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

let f: InventoryFixture | undefined;
const suffix = () => randomUUID().slice(0, 8);

async function setup() {
  f = await createInventoryFixture();
  session.userId = f.store.userId;
  return f;
}

async function colors(fx: InventoryFixture, count: number) {
  const s = suffix();
  return Promise.all(Array.from({ length: count }, (_, i) => testPrisma.color.create({ data: { name: `Extra ${s}-${i}`, value: `extra-${s}-${i}`, storeId: fx.store.id } })));
}

const body = (fx: InventoryFixture, variants: unknown[], name = `Grupo SKU ${suffix()}`) => ({
  name,
  description: "",
  categoryId: fx.category.id,
  defaultPrice: 12000,
  defaultCost: 5000,
  images: [{ url: `https://res.cloudinary.com/test/image/upload/v1/${suffix()}.jpg`, isMain: true }],
  imageMapping: [],
  variants,
});

async function post(fx: InventoryFixture, payload: unknown) {
  const { POST } = await import("@/app/api/[storeId]/product-groups/route");
  return POST(json("POST", payload), { params: { storeId: fx.store.id } });
}

const counts = async (storeId: string) => ({
  groups: await testPrisma.productGroup.count({ where: { storeId } }),
  products: await testPrisma.product.count({ where: { storeId } }),
});

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    const storeId = f.store.id;
    await testPrisma.image.deleteMany({ where: { OR: [{ product: { storeId } }, { productGroup: { storeId } }] } });
    await testPrisma.productSlugAlias.deleteMany({ where: { storeId } });
    await testPrisma.product.updateMany({ where: { storeId }, data: { productGroupId: null } });
    await testPrisma.product.deleteMany({ where: { storeId, id: { notIn: [f.component.id, f.kit.id] } } });
    await testPrisma.productGroup.deleteMany({ where: { storeId } });
    await testPrisma.color.deleteMany({ where: { storeId, name: { startsWith: "Extra" } } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
  session.userId = null;
});

describe("guardar un grupo: SKU revisados antes de crear", () => {
  it("el mismo borrador dos veces: la segunda vez 409 «Este grupo ya se guardó» con el grupo y nada nuevo", async () => {
    const fx = await setup();
    const [a, b] = await colors(fx, 2);
    const s = suffix();
    const payload = body(fx, [
      { sizeId: fx.component.sizeId, colorId: a.id, designId: fx.component.designId, sku: `DUP-A-${s}`, images: [] },
      { sizeId: fx.component.sizeId, colorId: b.id, designId: fx.component.designId, sku: `DUP-B-${s}`, images: [] },
    ]);
    const first = await post(fx, payload);
    expect(first.status).toBe(200);
    const created = (await first.json()) as { id: string };
    const before = await counts(fx.store.id);

    const again = await post(fx, payload);
    expect(again.status).toBe(409);
    const data = (await again.json()) as { error: string; details: { code: string; groupId: string } };
    expect(data.error).toBe("Este grupo ya se guardó.");
    expect(data.details).toEqual({ code: "GROUP_ALREADY_SAVED", groupId: created.id });
    await expect(counts(fx.store.id)).resolves.toEqual(before);
  });

  it("un SKU que es de otro producto: 409 con el SKU y el producto, sin crear el grupo ni ninguna variante", async () => {
    const fx = await setup();
    const [a, b] = await colors(fx, 2);
    const before = await counts(fx.store.id);
    const response = await post(fx, body(fx, [
      { sizeId: fx.component.sizeId, colorId: a.id, designId: fx.component.designId, sku: `NUEVO-${suffix()}`, images: [] },
      { sizeId: fx.component.sizeId, colorId: b.id, designId: fx.component.designId, sku: fx.component.sku, images: [] },
    ]));
    expect(response.status).toBe(409);
    const data = (await response.json()) as { error: string; details: Record<string, unknown> };
    expect(data.error).toBe(`El SKU ${fx.component.sku} ya existe en otro producto.`);
    expect(data.details).toEqual({ code: "SKU_EXISTS", sku: fx.component.sku, productId: fx.component.id });
    await expect(counts(fx.store.id)).resolves.toEqual(before);
  });

  it("una variante sin SKU recibe uno del servidor con cola de 6 en base 36", async () => {
    const fx = await setup();
    const [a] = await colors(fx, 1);
    const response = await post(fx, body(fx, [{ sizeId: fx.component.sizeId, colorId: a.id, designId: fx.component.designId, images: [] }]));
    expect(response.status).toBe(200);
    const created = (await response.json()) as { id: string };
    const [variant] = await testPrisma.product.findMany({ where: { productGroupId: created.id }, select: { sku: true } });
    expect(variant.sku).toMatch(/-[0-9A-Z]{6}$/);
  });

  it("al editar, una variante nueva con un SKU que ya existe se rechaza entera", async () => {
    const fx = await setup();
    const [a, b] = await colors(fx, 2);
    const first = await post(fx, body(fx, [{ sizeId: fx.component.sizeId, colorId: a.id, designId: fx.component.designId, sku: `EDIT-A-${suffix()}`, images: [] }], "Grupo edición"));
    const group = (await first.json()) as { id: string };
    const member = await testPrisma.product.findFirstOrThrow({ where: { productGroupId: group.id } });
    const before = await counts(fx.store.id);
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const response = await PATCH(
      json("PATCH", {
        ...body(fx, [
          { id: member.id, sizeId: member.sizeId, colorId: member.colorId, designId: member.designId, sku: member.sku },
          { sizeId: fx.component.sizeId, colorId: b.id, designId: fx.component.designId, sku: fx.component.sku, images: [] },
        ], "Grupo edición"),
        preserveSlug: true,
        confirmRemovals: true,
      }),
      { params: { storeId: fx.store.id, productGroupId: group.id } },
    );
    expect(response.status).toBe(409);
    expect(((await response.json()) as { details: { code: string } }).details.code).toBe("SKU_EXISTS");
    await expect(counts(fx.store.id)).resolves.toEqual(before);
  });
});
