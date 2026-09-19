import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));
const cloudinary = vi.hoisted(() => ({ delete_resources: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cloudinary", () => ({ default: { v2: { api: { delete_resources: cloudinary.delete_resources } } } }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));

const json = (method: string, body?: unknown, url = "http://admin.test/api/x") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const photo = (name: string) => `https://res.cloudinary.com/test/image/upload/v1/${name}.jpg`;

/**
 * Fase 2B, fase 3: convertir un producto en grupo reparte el stock con un
 * movimiento propio y la opción nueva hereda envío, opciones y ofertas;
 * «Desagrupar» devuelve productos sueltos con sus fotos y las ofertas del
 * grupo, sin borrar nada.
 */
describe("product conversion and ungroup with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  const suffix = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      const storeId = fixture.store.id;
      await testPrisma.offerProduct.deleteMany({ where: { product: { storeId } } });
      await testPrisma.offerProductGroup.deleteMany({ where: { productGroup: { storeId } } });
      await testPrisma.offer.deleteMany({ where: { storeId } });
      await testPrisma.productCatalogOptionValue.deleteMany({ where: { storeId } });
      await testPrisma.catalogOptionValue.deleteMany({ where: { storeId } });
      await testPrisma.catalogOption.deleteMany({ where: { storeId } });
      await testPrisma.image.deleteMany({
        where: { OR: [{ product: { storeId } }, { productGroup: { storeId } }] },
      });
      await testPrisma.productSlugAlias.deleteMany({ where: { storeId } });
      await testPrisma.inventoryMovement.deleteMany({ where: { storeId } });
      await testPrisma.product.updateMany({ where: { storeId }, data: { productGroupId: null } });
      await testPrisma.product.deleteMany({
        where: { storeId, id: { notIn: [fixture.component.id, fixture.kit.id] } },
      });
      await testPrisma.productGroup.deleteMany({ where: { storeId } });
      await testPrisma.color.deleteMany({ where: { storeId, name: { startsWith: "Extra" } } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
    session.userId = null;
    cloudinary.delete_resources.mockReset();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function setup() {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    return fixture;
  }

  async function createOffer(f: InventoryFixture, name: string) {
    return testPrisma.offer.create({
      data: {
        storeId: f.store.id,
        name,
        type: "PERCENTAGE",
        amount: 10,
        startDate: new Date(Date.now() - 86_400_000),
        endDate: new Date(Date.now() + 7 * 86_400_000),
        isActive: true,
      },
    });
  }

  it("converts a product into a group: stock split as VARIANT_CONVERSION, new option inherits shipping, options and offers", async () => {
    const f = await setup();
    const { POST } = await import("@/app/api/[storeId]/products/[productId]/convert-to-variants/review/route");
    const s = suffix();
    const extraColor = await testPrisma.color.create({
      data: { name: `Extra ${s}`, value: `extra-${s}`, storeId: f.store.id },
    });
    const option = await testPrisma.catalogOption.create({
      data: {
        storeId: f.store.id,
        key: `material-${s}`,
        name: "Material",
        values: { create: [{ storeId: f.store.id, name: "Acero", value: `acero-${s}` }] },
      },
      include: { values: true },
    });
    const offer = await createOffer(f, "Hasta agotar");
    const expired = await testPrisma.offer.create({
      data: {
        storeId: f.store.id,
        name: "Vencida",
        type: "PERCENTAGE",
        amount: 5,
        startDate: new Date(Date.now() - 20 * 86_400_000),
        endDate: new Date(Date.now() - 10 * 86_400_000),
        isActive: true,
      },
    });
    const product = await testPrisma.product.create({
      data: {
        name: "Termo pastel",
        slug: `termo-pastel-${s}`,
        description: "Termo de acero",
        stock: 7,
        price: 17500,
        acqPrice: 11000,
        transportationCost: 1200,
        availableAt: new Date("2026-09-01T00:00:00.000Z"),
        sku: `TERMO-${s}`,
        gtin: "7701234567897",
        hasNoProductIdentifier: false,
        storeId: f.store.id,
        categoryId: f.category.id,
        colorId: f.component.colorId,
        sizeId: f.component.sizeId,
        designId: f.component.designId,
        images: { create: [{ url: photo(`${s}-a`), isMain: true }, { url: photo(`${s}-b`) }] },
        catalogOptionValues: {
          create: [{ storeId: f.store.id, optionId: option.id, optionValueId: option.values[0].id }],
        },
        offers: { create: [{ offerId: offer.id }, { offerId: expired.id }] },
      },
    });

    const response = await POST(
      json("POST", {
        name: "Termo pastel",
        copyOffers: true,
        variants: [
          {
            imageUrl: photo(`${s}-a`),
            keepExistingProduct: true,
            stock: 4,
            color: { mode: "existing", id: f.component.colorId },
            design: { mode: "existing", id: f.component.designId },
            sizeId: f.component.sizeId,
          },
          {
            imageUrl: photo(`${s}-b`),
            keepExistingProduct: false,
            stock: 3,
            color: { mode: "existing", id: extraColor.id },
            design: { mode: "existing", id: f.component.designId },
            sizeId: f.component.sizeId,
          },
        ],
      }),
      { params: { storeId: f.store.id, productId: product.id } },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.createdProductIds).toHaveLength(1);
    expect(body.copiedOffers).toBe(1);

    const kept = await testPrisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { images: true, offers: true },
    });
    expect(kept).toMatchObject({ productGroupId: body.productGroupId, stock: 4, gtin: "7701234567897", sku: `TERMO-${s}` });
    expect(kept.images.map((image) => image.url)).toEqual([photo(`${s}-a`)]);
    expect(kept.offers).toHaveLength(2);

    const created = await testPrisma.product.findUniqueOrThrow({
      where: { id: body.createdProductIds[0] },
      include: { images: true, offers: true, catalogOptionValues: true },
    });
    expect(created).toMatchObject({
      productGroupId: body.productGroupId,
      stock: 3,
      price: 17500,
      acqPrice: 11000,
      transportationCost: 1200,
      availableAt: new Date("2026-09-01T00:00:00.000Z"),
      hasNoProductIdentifier: true,
      gtin: null,
      colorId: extraColor.id,
    });
    expect(created.slug).not.toBe("");
    expect(created.images.map((image) => image.url)).toEqual([photo(`${s}-b`)]);
    // Solo la oferta vigente viaja; la vencida no.
    expect(created.offers.map((row) => row.offerId)).toEqual([offer.id]);
    expect(created.catalogOptionValues).toMatchObject([{ optionId: option.id, optionValueId: option.values[0].id }]);

    const movements = await testPrisma.inventoryMovement.findMany({
      where: { storeId: f.store.id, type: "VARIANT_CONVERSION" },
      orderBy: { quantity: "asc" },
    });
    expect(movements).toMatchObject([
      { productId: product.id, quantity: -3, previousStock: 7, newStock: 4, referenceId: body.productGroupId },
      { productId: created.id, quantity: 3, previousStock: 0, newStock: 3, referenceId: body.productGroupId },
    ]);
    expect(await testPrisma.inventoryMovement.count({ where: { storeId: f.store.id, type: "MANUAL_ADJUSTMENT" } })).toBe(0);
  });

  it("ungroups without losing anything: variants keep their data, group offers and photos pass to them", async () => {
    const f = await setup();
    const { DELETE } = await import("@/app/api/[storeId]/product-groups/[productGroupId]/route");
    const s = suffix();
    const groupOffer = await createOffer(f, "Oferta del grupo");
    const withPhoto = await testPrisma.product.create({
      data: {
        name: "Agenda con foto",
        slug: `agenda-con-foto-${s}`,
        description: "",
        stock: 2,
        price: 15000,
        sku: `AGF-${s}`,
        storeId: f.store.id,
        categoryId: f.category.id,
        colorId: f.component.colorId,
        sizeId: f.component.sizeId,
        designId: f.component.designId,
        images: { create: [{ url: photo(`${s}-propia`), isMain: true }] },
        // Ya tenía la oferta del grupo por su cuenta: no se duplica.
        offers: { create: [{ offerId: groupOffer.id }] },
      },
    });
    const extraColor = await testPrisma.color.create({
      data: { name: `Extra ${s}`, value: `extra-${s}`, storeId: f.store.id },
    });
    const withoutPhoto = await testPrisma.product.create({
      data: {
        name: "Agenda sin foto",
        slug: `agenda-sin-foto-${s}`,
        description: "",
        stock: 5,
        price: 15000,
        sku: `AGS-${s}`,
        storeId: f.store.id,
        categoryId: f.category.id,
        colorId: extraColor.id,
        sizeId: f.component.sizeId,
        designId: f.component.designId,
      },
    });
    const group = await testPrisma.productGroup.create({
      data: {
        name: "Agenda",
        slug: `agenda-${s}`,
        description: "",
        storeId: f.store.id,
        images: { create: [{ url: photo(`${s}-grupo`), isMain: true }] },
        products: { connect: [{ id: withPhoto.id }, { id: withoutPhoto.id }] },
        offers: { create: [{ offerId: groupOffer.id }] },
      },
    });

    const response = await DELETE(json("DELETE"), {
      params: { storeId: f.store.id, productGroupId: group.id },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ungrouped).toEqual({
      variants: expect.arrayContaining([
        { id: withPhoto.id, name: "Agenda con foto" },
        { id: withoutPhoto.id, name: "Agenda sin foto" },
      ]),
      offersCarried: 1,
      photosCopiedTo: 1,
    });

    expect(await testPrisma.productGroup.findUnique({ where: { id: group.id } })).toBeNull();
    const [a, b] = await Promise.all(
      [withPhoto.id, withoutPhoto.id].map((id) =>
        testPrisma.product.findUniqueOrThrow({ where: { id }, include: { images: true, offers: true } }),
      ),
    );
    expect(a).toMatchObject({ productGroupId: null, stock: 2, sku: `AGF-${s}`, slug: `agenda-con-foto-${s}` });
    expect(a.images.map((image) => image.url)).toEqual([photo(`${s}-propia`)]);
    expect(a.offers).toHaveLength(1);
    expect(b).toMatchObject({ productGroupId: null, stock: 5, sku: `AGS-${s}` });
    expect(b.images.map((image) => image.url)).toEqual([photo(`${s}-grupo`)]);
    expect(b.offers.map((row) => row.offerId)).toEqual([groupOffer.id]);
    // La foto del grupo sigue en uso: no se borra de Cloudinary.
    expect(cloudinary.delete_resources).not.toHaveBeenCalled();
  });
});
