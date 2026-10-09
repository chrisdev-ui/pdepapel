import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * #19 «Publicar grupo»: un borrador base configurado una vez se extiende a
 * las demás variantes del grupo. Corre la ruta real contra MySQL; Mercado
 * Libre solo se simula en la búsqueda de ítems por SKU.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const remoteBySku = vi.hoisted(() => new Map<string, { id: string; status: string; userProductId: string }[]>());

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }) }));
vi.mock("@/lib/mercadolibre/publish-attempt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/publish-attempt")>()),
  findSellerItemsBySku: async (_connectionId: string, sku: string) => remoteBySku.get(sku) ?? [],
}));

import { GET, POST } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/group/route";

describe("Publicar grupo en Mercado Libre (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let groupId = "";
  const extraProductIds: string[] = [];

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.marketplaceListing.deleteMany({ where: { connection: { storeId: fixture.store.id } } });
      await testPrisma.image.deleteMany({ where: { productId: { in: [...extraProductIds, fixture.component.id] } } });
      await testPrisma.product.deleteMany({ where: { id: { in: extraProductIds } } });
      await testPrisma.product.update({ where: { id: fixture.component.id }, data: { productGroupId: null } });
      if (groupId) await testPrisma.productGroup.delete({ where: { id: groupId } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
    groupId = "";
    extraProductIds.length = 0;
    remoteBySku.clear();
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function seed() {
    fixture = await createInventoryFixture();
    const group = await testPrisma.productGroup.create({
      data: { storeId: fixture.store.id, name: "Tote kawaii", description: "", brand: "Genérica" },
    });
    groupId = group.id;
    const base = fixture.component;
    await testPrisma.product.update({
      where: { id: base.id },
      data: { productGroupId: group.id, images: { create: [{ url: "https://res.cloudinary.com/demo/image/upload/rosa.jpg" }] } },
    });
    const variant = async (name: string, stock: number, extra: Record<string, unknown> = {}) => {
      const product = await testPrisma.product.create({
        data: {
          name,
          slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()}`,
          description: "",
          stock,
          price: 30000,
          acqPrice: 8000,
          sku: `TOT-${randomUUID()}`,
          storeId: base.storeId,
          categoryId: base.categoryId,
          colorId: base.colorId,
          sizeId: base.sizeId,
          designId: base.designId,
          productGroupId: group.id,
          images: { create: [{ url: `https://res.cloudinary.com/demo/image/upload/${randomUUID()}.jpg` }] },
          ...extra,
        },
      });
      extraProductIds.push(product.id);
      return product;
    };
    const lista = await variant("Tote Celeste", 3);
    const sinStock = await variant("Tote Lila", 1);
    const enMercadoLibre = await variant("Tote Menta", 4);
    const bajoCosto = await variant("Tote Negro", 4, { acqPrice: 90000 });

    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: fixture.store.id, provider: "MERCADOLIBRE", status: "CONNECTED", sellerId: `seller-${randomUUID()}` },
    });
    const master = await testPrisma.marketplaceListing.create({
      data: {
        connectionId: connection.id,
        productId: base.id,
        categoryId: "MCO1234",
        listingType: "gold_special",
        marketplacePrice: 55000,
        stockSafetyBuffer: 1,
        metadata: {
          familyName: "Tote Bag Kawaii De Tela",
          attributes: [
            { id: "BRAND", value_name: "Genérica" },
            { id: "MATERIAL", value_name: "Lona" },
            { id: "COLOR", value_name: "Rosa" },
            { id: "GTIN", value_name: "7701234567890" },
          ],
          saleConditions: { shippingMode: "me2", freeShipping: true, localPickUp: false, packageDimensions: null },
        },
      },
    });
    remoteBySku.set(enMercadoLibre.sku, [{ id: "MCO-SUELTA", status: "active", userProductId: "MCOU-SUELTA" }]);
    session.userId = fixture.store.userId;
    return { master, lista, sinStock, enMercadoLibre, bajoCosto, connection };
  }

  const params = () => ({ params: { storeId: fixture!.store.id } });
  const post = (body: unknown) =>
    POST(new Request("http://admin.test/api/x", { method: "POST", body: JSON.stringify(body) }), params());

  it("el plan marca cada variante: lista, sin stock, ya en Mercado Libre sin vincular", async () => {
    const { master, lista, sinStock, enMercadoLibre } = await seed();
    const response = await GET(new Request(`http://admin.test/api/x?listingId=${master.id}`), params());
    expect(response.status).toBe(200);
    const plan = await response.json();
    const kind = (productId: string) => plan.variants.find((variant: { productId: string }) => variant.productId === productId).state.kind;
    expect(plan.master.familyName).toBe("Tote Bag Kawaii De Tela");
    expect(kind(master.productId)).toBe("draft");
    expect(kind(lista.id)).toBe("ready");
    expect(kind(sinStock.id)).toBe("no-stock");
    expect(kind(enMercadoLibre.id)).toBe("remote");
  });

  it("crea un borrador por variante lista con la configuración del base y explica cada omitida", async () => {
    const { master, lista, sinStock, enMercadoLibre, bajoCosto } = await seed();
    const attributes = [
      { id: "BRAND", value_name: "Genérica" },
      { id: "COLOR", value_name: "Celeste" },
      { id: "GTIN", value_name: "7701234567890" },
    ];
    const response = await post({
      listingId: master.id,
      variants: [lista, sinStock, enMercadoLibre, bajoCosto].map((product) => ({
        productId: product.id,
        marketplacePrice: 55000,
        attributes,
      })),
    });
    expect(response.status).toBe(201);
    const result = await response.json();

    expect(result.created.map((row: { productId: string }) => row.productId)).toEqual([lista.id]);
    const reasons = Object.fromEntries(result.skipped.map((row: { productId: string; reason: string }) => [row.productId, row.reason]));
    expect(reasons[sinStock.id]).toContain("Sin unidades");
    expect(reasons[enMercadoLibre.id]).toContain("MCO-SUELTA");
    expect(reasons[bajoCosto.id]).toContain("por debajo del costo");

    const draft = await testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id: result.created[0].listingId } });
    expect(draft).toMatchObject({ status: "DRAFT", externalItemId: null, categoryId: "MCO1234", listingType: "gold_special", stockSafetyBuffer: 1, marketplacePrice: 55000 });
    const metadata = draft.metadata as Record<string, unknown>;
    expect(metadata.familyName).toBe("Tote Bag Kawaii De Tela");
    expect(metadata.familyBatchId).toBe(result.familyBatchId);
    expect(metadata.productGroupId).toBe(groupId);
    expect(metadata.saleConditions).toMatchObject({ freeShipping: true });
    // El GTIN de otra variante nunca viaja: se toma del producto al publicar.
    expect(metadata.attributes).toEqual([
      { id: "BRAND", value_name: "Genérica" },
      { id: "COLOR", value_name: "Celeste" },
    ]);

    const base = await testPrisma.marketplaceListing.findUniqueOrThrow({ where: { id: master.id } });
    expect((base.metadata as Record<string, unknown>).familyBatchId).toBe(result.familyBatchId);
    expect((base.metadata as Record<string, unknown>).familyName).toBe("Tote Bag Kawaii De Tela");

    const again = await (await post({ listingId: master.id, variants: [{ productId: lista.id, marketplacePrice: 55000, attributes }] })).json();
    expect(again.created).toEqual([]);
    expect(again.skipped[0].reason).toContain("borrador");
    expect(again.familyBatchId).toBe(result.familyBatchId);
  });

  it("solo la dueña de la tienda puede extender un grupo", async () => {
    const { master, lista } = await seed();
    session.userId = "otra-persona";
    const response = await post({ listingId: master.id, variants: [{ productId: lista.id, marketplacePrice: 55000, attributes: [] }] });
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(await testPrisma.marketplaceListing.count({ where: { productId: lista.id } })).toBe(0);
  });
});
