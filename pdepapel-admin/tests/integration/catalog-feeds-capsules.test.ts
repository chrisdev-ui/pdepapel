import { CAPSULAS_SORPRESA_ID } from "@/constants";
import { buildGoogleMerchantFeed, getGoogleMerchantFeedProductArgs } from "@/lib/google-merchant-feed";
import { buildMetaCatalogFeed, getMetaCatalogFeedProductArgs } from "@/lib/meta-catalog-feed";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { testPrisma } from "./helpers/database";

async function createFixture() {
  const suffix = randomUUID();
  const store = await testPrisma.store.create({ data: { name: `Feeds ${suffix}`, userId: `test-user-${suffix}` } });
  const type = await testPrisma.type.create({ data: { name: "Papelería", slug: `papeleria-${suffix}`, storeId: store.id } });
  const normalCategory = await testPrisma.category.create({ data: { name: "Agendas", slug: `agendas-${suffix}`, storeId: store.id, typeId: type.id } });
  const capsuleCategory = await testPrisma.category.upsert({
    where: { id: CAPSULAS_SORPRESA_ID },
    update: {},
    create: { id: CAPSULAS_SORPRESA_ID, name: "Kits sorpresa", slug: `kits-sorpresa-${suffix}`, storeId: store.id, typeId: type.id },
  });
  const size = await testPrisma.size.create({ data: { name: "S", value: `s-${suffix}`, storeId: store.id } });
  const color = await testPrisma.color.create({ data: { name: "Multicolor", value: `multi-${suffix}`, storeId: store.id } });
  const design = await testPrisma.design.create({ data: { name: "Sorpresa", storeId: store.id } });

  const makeProduct = async (name: string, categoryId: string, price: number) => {
    const product = await testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}`,
        description: "Producto de pruebas",
        stock: 10,
        price,
        acqPrice: 4000,
        sku: `FEED-${suffix}-${name}`,
        hasNoProductIdentifier: true,
        storeId: store.id,
        categoryId,
        colorId: color.id,
        sizeId: size.id,
        designId: design.id,
      },
    });
    await testPrisma.image.create({ data: { productId: product.id, url: `https://res.cloudinary.com/demo/image/upload/v1/${suffix}-${product.id}.jpg`, isMain: true } });
    return product;
  };

  const agenda = await makeProduct("Agenda", normalCategory.id, 30000);
  const combo = await makeProduct("Capsula sorpresa x5", capsuleCategory.id, 40000);
  return { store, agenda, combo };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function deleteFixture(fixture: Fixture) {
  const productIds = [fixture.agenda.id, fixture.combo.id];
  await testPrisma.image.deleteMany({ where: { productId: { in: productIds } } });
  await testPrisma.product.deleteMany({ where: { id: { in: productIds } } });
  await testPrisma.category.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.size.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.color.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.design.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.type.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.store.delete({ where: { id: fixture.store.id } });
}

describe("feeds de Google y Meta sin «Kits sorpresa»", () => {
  let fixture: Fixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (fixture) {
      await deleteFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("una cápsula disponible y con foto no llega a ningún feed; el resto del catálogo sí", async () => {
    fixture = await createFixture();

    const google = await testPrisma.product.findMany(getGoogleMerchantFeedProductArgs(fixture.store.id));
    const meta = await testPrisma.product.findMany(getMetaCatalogFeedProductArgs(fixture.store.id));
    expect(google.map((product) => product.id)).toEqual([fixture.agenda.id]);
    expect(meta.map((product) => product.id)).toEqual([fixture.agenda.id]);

    const googleTsv = buildGoogleMerchantFeed(google).tsv;
    const metaTsv = buildMetaCatalogFeed(meta).tsv;
    expect(googleTsv).toContain(fixture.agenda.sku);
    expect(metaTsv).toContain(fixture.agenda.sku);
    expect(googleTsv).not.toContain(fixture.combo.sku);
    expect(metaTsv).not.toContain(fixture.combo.sku);
  });
});
