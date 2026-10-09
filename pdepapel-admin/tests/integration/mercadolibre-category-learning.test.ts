import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * #22: la subcategoría aprende la categoría de Mercado Libre con que se
 * publicó. Corre contra MySQL; Mercado Libre solo responde nombres.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }) }));
vi.mock("@/lib/mercadolibre/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/client")>()),
  getMercadoLibreJson: async (_c: string, resource: string) => ({ name: `Nombre de ${resource.split("/").pop()}` }),
}));

import { GET as previewBackfill, POST as applyBackfill } from "@/app/api/[storeId]/marketplaces/mercadolibre/profiles/learn/route";
import { PATCH as acceptProfile } from "@/app/api/[storeId]/marketplaces/mercadolibre/profiles/[profileId]/route";
import { learnFromPublishedListing, recordCategoryUse } from "@/lib/mercadolibre/category-learning";

describe("Categorías aprendidas por subcategoría (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let connectionId = "";
  const extraCategories: string[] = [];
  const extraProducts: string[] = [];

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.marketplacePublicationProfile.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.marketplaceListing.deleteMany({ where: { connectionId } });
      await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
      await testPrisma.product.deleteMany({ where: { id: { in: extraProducts } } });
      await testPrisma.category.deleteMany({ where: { id: { in: extraCategories } } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
    connectionId = "";
    extraCategories.length = 0;
    extraProducts.length = 0;
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function seed() {
    fixture = await createInventoryFixture();
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: fixture.store.id, provider: "MERCADOLIBRE", status: "CONNECTED", sellerId: `seller-${randomUUID()}` },
    });
    connectionId = connection.id;
    session.userId = fixture.store.userId;
    const base = fixture.component;
    const category = async (name: string) => {
      const row = await testPrisma.category.create({ data: { name, slug: `${name}-${randomUUID()}`, storeId: base.storeId, typeId: (await testPrisma.category.findUniqueOrThrow({ where: { id: base.categoryId } })).typeId } });
      extraCategories.push(row.id);
      return row;
    };
    const product = async (categoryId: string) => {
      const row = await testPrisma.product.create({
        data: { name: `P ${randomUUID()}`, slug: randomUUID(), description: "", stock: 1, price: 10000, sku: `S-${randomUUID()}`, storeId: base.storeId, categoryId, colorId: base.colorId, sizeId: base.sizeId, designId: base.designId },
      });
      extraProducts.push(row.id);
      return row;
    };
    const listing = (productId: string, categoryId: string) =>
      testPrisma.marketplaceListing.create({
        data: {
          connectionId,
          productId,
          externalItemId: `MCO${randomUUID().slice(0, 8)}`,
          status: "ACTIVE",
          categoryId,
          marketplacePrice: 30000,
          stockSafetyBuffer: 0,
          metadata: { attributes: [{ id: "BRAND", value_name: "Genérica" }, { id: "COLOR", value_name: "Rosa" }, { id: "MATERIAL", value_name: "Lona" }] },
        },
      });
    const cartucheras = await category("Cartucheras");
    const herramientas = await category("Herramientas");
    await listing((await product(cartucheras.id)).id, "MCO441855");
    await listing((await product(cartucheras.id)).id, "MCO441855");
    await listing((await product(herramientas.id)).id, "MCO441856");
    await listing((await product(herramientas.id)).id, "MCO403380");
    return { cartucheras, herramientas };
  }

  const params = () => ({ params: { storeId: fixture!.store.id } });

  it("la vista previa lista lo que sembraría sin escribir, y deja fuera lo mezclado", async () => {
    await seed();
    const response = await previewBackfill(new Request("http://admin.test/x"), params());
    const groups = await response.json();
    expect(groups.map((group: { localCategoryName: string; categoryId: string | null; skipped: string | null }) => [group.localCategoryName, group.categoryId, group.skipped])).toEqual([
      ["Cartucheras", "MCO441855", null],
      ["Herramientas", null, "mezclada"],
    ]);
    expect(groups[0].categories).toEqual([{ categoryId: "MCO441855", categoryName: "Nombre de MCO441855" }]);
    expect(await testPrisma.marketplacePublicationProfile.count({ where: { storeId: fixture!.store.id } })).toBe(0);
  });

  it("sembrar crea perfiles sugeridos por el camino normal, con la ficha común y los usos contados", async () => {
    const { cartucheras, herramientas } = await seed();
    const empty = await applyBackfill(new Request("http://admin.test/x", { method: "POST", body: "{}" }), params());
    expect(empty.status).toBe(400);
    const response = await applyBackfill(
      new Request("http://admin.test/x", { method: "POST", body: JSON.stringify({ localCategoryIds: [cartucheras.id, herramientas.id] }) }),
      params(),
    );
    // La mezclada no se escribe aunque venga en la lista.
    expect(await response.json()).toEqual({ profiles: 1, uses: 2 });
    const profile = await testPrisma.marketplacePublicationProfile.findFirstOrThrow({ where: { storeId: fixture!.store.id } });
    expect(profile).toMatchObject({ localCategoryId: cartucheras.id, categoryId: "MCO441855", origin: "LEARNED", state: "SUGGESTED" });
    expect(profile.attributes).toEqual([{ id: "BRAND", value_name: "Genérica" }, { id: "MATERIAL", value_name: "Lona" }]);
    expect(profile.candidates).toEqual([expect.objectContaining({ categoryId: "MCO441855", categoryName: "Nombre de MCO441855", uses: 2 })]);
  });

  it("«Usar esta» lo acepta; después aprender no le cambia la categoría elegida", async () => {
    const { cartucheras } = await seed();
    await applyBackfill(new Request("http://admin.test/x", { method: "POST", body: JSON.stringify({ localCategoryIds: [cartucheras.id] }) }), params());
    const profile = await testPrisma.marketplacePublicationProfile.findFirstOrThrow({ where: { storeId: fixture!.store.id } });

    const accepted = await acceptProfile(
      new Request("http://admin.test/x", { method: "PATCH", body: JSON.stringify({ categoryId: "MCO441855" }) }),
      { params: { storeId: fixture!.store.id, profileId: profile.id } },
    );
    expect(accepted.status).toBe(200);

    for (let index = 0; index < 3; index += 1) {
      await recordCategoryUse({ storeId: fixture!.store.id, localCategoryId: cartucheras.id, localCategoryName: "Cartucheras", categoryId: "MCO999", categoryName: "Estuches", attributes: null, stockSafetyBuffer: 0 });
    }
    const after = await testPrisma.marketplacePublicationProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(after).toMatchObject({ categoryId: "MCO441855", state: "ACCEPTED" });
    expect((after.candidates as { categoryId: string }[])[0].categoryId).toBe("MCO999");
  });

  it("al publicar aprende la categoría de la subcategoría del producto", async () => {
    const { cartucheras } = await seed();
    const listing = await testPrisma.marketplaceListing.findFirstOrThrow({ where: { connectionId, product: { categoryId: cartucheras.id } } });
    await learnFromPublishedListing(listing.id);
    const profile = await testPrisma.marketplacePublicationProfile.findFirstOrThrow({ where: { localCategoryId: cartucheras.id } });
    expect(profile).toMatchObject({ categoryId: "MCO441855", origin: "LEARNED", state: "SUGGESTED" });
  });

  it("solo la dueña de la tienda siembra o acepta", async () => {
    const { cartucheras } = await seed();
    session.userId = "otra-persona";
    const response = await applyBackfill(new Request("http://admin.test/x", { method: "POST", body: JSON.stringify({ localCategoryIds: [cartucheras.id] }) }), params());
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(await testPrisma.marketplacePublicationProfile.count({ where: { storeId: fixture!.store.id } })).toBe(0);
  });
});
