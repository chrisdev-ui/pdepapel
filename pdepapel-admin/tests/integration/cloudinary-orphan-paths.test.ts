import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));
const cloudinary = vi.hoisted(() => ({ deleteResources: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cloudinary", () => ({
  default: { v2: { api: { delete_resources: cloudinary.deleteResources } } },
}));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreOutboxEvent: vi.fn() }));

const CLOUD = "https://res.cloudinary.com/test/image/upload/v1";
const url = (id: string) => `${CLOUD}/${id}.jpg`;
const deletedIds = () =>
  cloudinary.deleteResources.mock.calls.flatMap((call) => call[0] as string[]).sort();
const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/**
 * Seis rutas borraban filas de `Image` (o portadas) sin tocar Cloudinary, y
 * el archivo quedaba huérfano para siempre. Ahora todas pasan por
 * `deleteCloudinaryImages`: se borra DESPUÉS de confirmar y solo lo que
 * ninguna otra fila sigue usando.
 */
describe("Cloudinary cleanup on every hard-delete path (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let extraStoreId: string | undefined;
  const suffix = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    cloudinary.deleteResources.mockReset();
    if (fixture) {
      const storeId = fixture.store.id;
      await testPrisma.image.deleteMany({
        where: { OR: [{ product: { storeId } }, { productGroup: { storeId } }] },
      });
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId } });
      await testPrisma.product.updateMany({ where: { storeId }, data: { productGroupId: null } });
      await testPrisma.product.deleteMany({
        where: { storeId, id: { notIn: [fixture.component.id, fixture.kit.id] } },
      });
      await testPrisma.productGroup.deleteMany({ where: { storeId } });
      await testPrisma.category.deleteMany({ where: { storeId, id: { not: fixture.category.id } } });
      await testPrisma.color.deleteMany({ where: { storeId, name: { startsWith: "Extra" } } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    if (extraStoreId) {
      await testPrisma.category.deleteMany({ where: { storeId: extraStoreId } });
      await testPrisma.type.deleteMany({ where: { storeId: extraStoreId } });
      await testPrisma.store.deleteMany({ where: { id: extraStoreId } });
      extraStoreId = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function setup() {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    cloudinary.deleteResources.mockResolvedValue({});
    return fixture;
  }

  function createProduct(f: InventoryFixture, name: string, images: string[], extra: Record<string, unknown> = {}) {
    const s = suffix();
    return testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${s}`,
        description: "Producto de pruebas",
        stock: 7,
        price: 10000,
        acqPrice: 4000,
        sku: `TEST-${s}`,
        storeId: f.store.id,
        categoryId: f.category.id,
        colorId: f.component.colorId,
        sizeId: f.component.sizeId,
        designId: f.component.designId,
        images: { create: images.map((u, i) => ({ url: u, isMain: i === 0 })) },
        ...extra,
      },
    });
  }

  it("group DELETE with variants removes the group and variant photos but keeps a photo another product still uses", async () => {
    const f = await setup();
    const { DELETE } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const group = await testPrisma.productGroup.create({
      data: {
        name: "Grupo borrable",
        slug: `grupo-borrable-${suffix()}`,
        description: "",
        storeId: f.store.id,
        images: { create: [{ url: url("grupo-foto"), isMain: true }] },
      },
    });
    await createProduct(f, "Variante X", [url("variante-x"), url("compartida")], { productGroupId: group.id });
    // La misma foto vive en otro producto suelto: no se puede borrar.
    await createProduct(f, "Suelto", [url("compartida")]);

    const res = await DELETE(
      new Request("http://admin.test/api/x?deleteVariants=true", { method: "DELETE" }),
      { params: { storeId: f.store.id, productGroupId: group.id } },
    );
    expect(res.status).toBe(200);
    expect(await testPrisma.productGroup.findUnique({ where: { id: group.id } })).toBeNull();
    expect(await testPrisma.product.count({ where: { storeId: f.store.id, name: "Variante X" } })).toBe(0);
    expect(deletedIds()).toEqual(["grupo-foto", "variante-x"]);
  });

  it("group PATCH deletes the replaced group photo and the removed variant's photo after the commit", async () => {
    const f = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const group = await testPrisma.productGroup.create({
      data: {
        name: "Grupo editable",
        slug: `grupo-editable-${suffix()}`,
        description: "",
        storeId: f.store.id,
        images: { create: [{ url: url("grupo-vieja"), isMain: true }] },
      },
    });
    const keep = await createProduct(f, "Se queda", [url("grupo-vieja")], { productGroupId: group.id });
    const extraColor = await testPrisma.color.create({
      data: { name: "Extra azul", value: `azul-${suffix()}`, storeId: f.store.id },
    });
    await createProduct(f, "Se va", [url("variante-que-se-va")], {
      productGroupId: group.id,
      colorId: extraColor.id,
    });

    const res = await PATCH(
      json("PATCH", {
        name: "Grupo editable",
        categoryId: f.category.id,
        images: [{ url: url("grupo-nueva"), isMain: true }],
        preserveSlug: true,
        confirmRemovals: true,
        variants: [
          {
            id: keep.id,
            sizeId: keep.sizeId,
            colorId: keep.colorId,
            designId: keep.designId,
            sku: keep.sku,
            price: "10000",
            acqPrice: "4000",
            stock: keep.stock,
          },
        ],
      }),
      { params: { storeId: f.store.id, productGroupId: group.id } },
    );
    expect(res.status).toBe(200);
    const remaining = await testPrisma.image.findMany({
      where: { OR: [{ productGroupId: group.id }, { product: { productGroupId: group.id } }] },
      select: { url: true },
    });
    expect(new Set(remaining.map((image) => image.url))).toEqual(new Set([url("grupo-nueva")]));
    expect(deletedIds()).toEqual(["grupo-vieja", "variante-que-se-va"]);
  });

  it("group POST deletes the old photos of an adopted standalone product", async () => {
    const f = await setup();
    const { POST } = await import("@/app/api/[storeId]/product-groups/route");
    const adopted = await createProduct(f, "Cartuchera suelta", [url("suelta-vieja")]);

    const res = await POST(
      json("POST", {
        name: "Cartuchera",
        categoryId: f.category.id,
        images: [{ url: url("grupo-adopta"), isMain: true }],
        defaultPrice: 15000,
        variants: [
          {
            id: adopted.id,
            sizeId: adopted.sizeId,
            colorId: adopted.colorId,
            designId: adopted.designId,
            sku: adopted.sku,
            price: "10000",
            acqPrice: "4000",
            stock: adopted.stock,
          },
        ],
      }),
      { params: { storeId: f.store.id } },
    );
    expect(res.status).toBe(200);
    const images = await testPrisma.image.findMany({ where: { productId: adopted.id }, select: { url: true } });
    expect(images.map((image) => image.url)).toEqual([url("grupo-adopta")]);
    expect(deletedIds()).toEqual(["suelta-vieja"]);
  });

  it("convert-to-variants review keeps every photo the new group still references", async () => {
    const f = await setup();
    const { POST } = await import("@/app/api/[storeId]/products/[productId]/convert-to-variants/review/route");
    const product = await createProduct(f, "Termo", [url("termo-1"), url("termo-2"), url("termo-3")]);
    const extraColor = await testPrisma.color.create({
      data: { name: "Extra lila", value: `lila-${suffix()}`, storeId: f.store.id },
    });

    const res = await POST(
      json("POST", {
        name: "Termo pastel",
        variants: [
          {
            imageUrl: url("termo-1"),
            keepExistingProduct: true,
            stock: 4,
            color: { mode: "existing", id: product.colorId },
            design: { mode: "existing", id: product.designId },
            sizeId: product.sizeId,
          },
          {
            imageUrl: url("termo-2"),
            keepExistingProduct: false,
            stock: 3,
            color: { mode: "existing", id: extraColor.id },
            design: { mode: "existing", id: product.designId },
            sizeId: product.sizeId,
          },
        ],
      }),
      { params: { storeId: f.store.id, productId: product.id } },
    );
    expect(res.status).toBe(200);
    const own = await testPrisma.image.findMany({ where: { productId: product.id }, select: { url: true } });
    expect(own.map((image) => image.url)).toEqual([url("termo-1")]);
    // El grupo nuevo conserva las tres fotos, así que Cloudinary no se toca.
    const groupImages = await testPrisma.image.count({ where: { productGroup: { storeId: f.store.id } } });
    expect(groupImages).toBe(3);
    expect(deletedIds()).toEqual([]);
  });

  it("category PATCH and DELETE delete a foldered cover only when it is replaced or the category goes", async () => {
    const f = await setup();
    const { PATCH, DELETE } = await import("@/app/api/[storeId]/categories/[categoryId]/route");
    const category = await testPrisma.category.findUniqueOrThrow({ where: { id: f.category.id } });
    await testPrisma.category.update({
      where: { id: category.id },
      data: { imageUrl: url("category-covers/agendas-vieja") },
    });

    const same = await PATCH(
      json("PATCH", { name: "Agendas", typeId: category.typeId, imageUrl: url("category-covers/agendas-vieja") }),
      { params: { storeId: f.store.id, categoryId: category.id } },
    );
    expect(same.status).toBe(200);
    expect(deletedIds()).toEqual([]);

    const replaced = await PATCH(
      json("PATCH", { name: "Agendas", typeId: category.typeId, imageUrl: url("category-covers/agendas-nueva") }),
      { params: { storeId: f.store.id, categoryId: category.id } },
    );
    expect(replaced.status).toBe(200);
    expect(deletedIds()).toEqual(["category-covers/agendas-vieja"]);

    const disposable = await testPrisma.category.create({
      data: {
        name: "Temporal",
        slug: `temporal-${suffix()}`,
        storeId: f.store.id,
        typeId: category.typeId,
        imageUrl: url("category-covers/temporal"),
      },
    });
    cloudinary.deleteResources.mockClear();
    const gone = await DELETE(json("DELETE"), { params: { storeId: f.store.id, categoryId: disposable.id } });
    expect(gone.status).toBe(200);
    expect(deletedIds()).toEqual(["category-covers/temporal"]);
  });

  it("store DELETE deletes the logo and category covers of that store only", async () => {
    const f = await setup();
    const { DELETE } = await import("@/app/api/stores/[storeId]/route");
    const store = await testPrisma.store.create({
      data: { name: `Tienda vacía ${suffix()}`, userId: `test-user-${suffix()}`, logoUrl: url("logo-tienda") },
    });
    extraStoreId = store.id;
    const type = await testPrisma.type.create({
      data: { name: "Regalos", slug: `regalos-${suffix()}`, storeId: store.id },
    });
    await testPrisma.category.create({
      data: {
        name: "Tazas",
        slug: `tazas-${suffix()}`,
        storeId: store.id,
        typeId: type.id,
        imageUrl: url("category-covers/tazas"),
      },
    });
    // La otra tienda usa la misma portada: se queda.
    await testPrisma.category.update({
      where: { id: f.category.id },
      data: { imageUrl: url("category-covers/tazas") },
    });
    session.userId = store.userId;

    const res = await DELETE(json("DELETE"), { params: { storeId: store.id } });
    expect(res.status).toBe(200);
    expect(await testPrisma.store.findUnique({ where: { id: store.id } })).toBeNull();
    extraStoreId = undefined;
    expect(deletedIds()).toEqual(["logo-tienda"]);
  });
});
