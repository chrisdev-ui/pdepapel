import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El feed del catálogo de Meta se sirve desde caché; al guardar una oferta se
 * borra (`invalidateStorePromotionsCache`) y la siguiente descarga ya trae el
 * `sale_price` de ahora. Caché en memoria, base local, sin llamar a Meta ni a
 * la tienda.
 */
const memory = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/catalog-feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/catalog-feed")>()),
  getFeedRedis: () => ({
    get: async (key: string) => memory.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      memory.set(key, value);
      return "OK";
    },
    del: async (...keys: string[]) => keys.filter((key) => memory.delete(key)).length,
  }),
}));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/mercadolibre/outbox", () => ({ enqueuePendingMarketplaceOutboxEventsForStore: vi.fn().mockResolvedValue(0) }));

const DAY = 24 * 60 * 60 * 1000;
let fixture: InventoryFixture;
let sku = "";

async function salePrice() {
  const { resolveMetaCatalogFeed } = await import("@/lib/meta-catalog-feed");
  const { tsv } = await resolveMetaCatalogFeed(fixture.store.id);
  const [header, ...rows] = tsv.split("\n").map((line) => line.split("\t"));
  const row = rows.find((cells) => cells[header.indexOf("id")] === sku);
  if (!row) throw new Error("el producto de prueba no está en el feed");
  return row[header.indexOf("sale_price")];
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
  const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } });
  sku = `MFD-${randomUUID().slice(0, 6).toUpperCase()}`;
  await testPrisma.product.create({
    data: { storeId: fixture.store.id, categoryId: fixture.category.id, ...attributes, name: "Tote feed Meta prueba", description: "Sintético", slug: `prueba-${randomUUID().slice(0, 8)}`, price: 40000, stock: 5, sku } as never,
  });
  // Sin una foto que cargue, el producto no sale en el feed de Meta.
  const created = await testPrisma.product.findFirstOrThrow({ where: { sku }, select: { id: true } });
  await testPrisma.image.create({ data: { productId: created.id, url: "https://res.cloudinary.com/demo/image/upload/v1/tote.jpg", isMain: true } });
});

afterAll(async () => {
  const store = fixture.store.id;
  const offers = (await testPrisma.offer.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.offerProduct.deleteMany({ where: { offerId: { in: offers } } });
  await testPrisma.offer.deleteMany({ where: { storeId: store } });
  await testPrisma.image.deleteMany({ where: { product: { storeId: store, description: "Sintético" } } });
  await testPrisma.product.deleteMany({ where: { storeId: store, description: "Sintético" } });
  await deleteInventoryFixture(fixture);
});

describe("feed del catálogo de Meta y ofertas", () => {
  it("una oferta nueva aparece en cuanto se invalida, y una terminada desaparece", async () => {
    const { invalidateStorePromotionsCache } = await import("@/lib/cache");
    expect(await salePrice()).toBe("");

    const product = await testPrisma.product.findFirstOrThrow({ where: { sku }, select: { id: true } });
    const offer = await testPrisma.offer.create({
      data: { storeId: fixture.store.id, name: "Oferta feed", type: "PERCENTAGE", amount: 25, startDate: new Date(Date.now() - DAY), endDate: new Date(Date.now() + DAY), products: { create: [{ productId: product.id }] } } as never,
    });
    // Sin invalidar, el feed guardado sigue igual: es la caché la que manda.
    expect(await salePrice()).toBe("");

    await invalidateStorePromotionsCache(fixture.store.id);
    expect(await salePrice()).toBe("30000.00 COP");

    await testPrisma.offer.update({ where: { id: offer.id }, data: { isActive: false } });
    await invalidateStorePromotionsCache(fixture.store.id);
    expect(await salePrice()).toBe("");
  });
});
