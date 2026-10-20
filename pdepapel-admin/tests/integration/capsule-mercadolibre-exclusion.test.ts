import { MarketplaceConnectionStatus, MarketplaceProvider } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: session.userId }) }));

import { CAPSULES_NOT_ON_MERCADOLIBRE } from "@/lib/mercadolibre/capsule-exclusion";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/** El producto de una edición de cápsulas no se publica en Mercado Libre. */
describe("Mercado Libre sin cápsulas", () => {
  let f: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (f) await deleteInventoryFixture(f);
    f = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("crear una publicación de un producto de edición responde 409 y no crea nada", async () => {
    f = await createInventoryFixture();
    session.userId = f.store.userId;
    const editionProduct = await testPrisma.product.create({
      data: { name: "Edicion Escritorio", slug: `edicion-${f.store.id}`, description: "Cápsulas", stock: 10, price: 12900, acqPrice: 4000, sku: `ED-${f.store.id}`, storeId: f.store.id, categoryId: f.category.id, colorId: f.component.colorId, sizeId: f.component.sizeId, designId: f.component.designId },
    });
    await testPrisma.capsuleEdition.create({ data: { storeId: f.store.id, number: 1, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3350, costBandMax: 5580 } });
    const connection = await testPrisma.marketplaceConnection.create({
      data: { storeId: f.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: MarketplaceConnectionStatus.CONNECTED, sellerId: `seller-${randomBytes(4).toString("hex")}` },
    });

    const { POST } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/listings/route");
    const response = await POST(
      new Request(`https://admin.test/api/${f.store.id}/marketplaces/mercadolibre/listings`, { method: "POST", body: JSON.stringify({ productId: editionProduct.id }) }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining(CAPSULES_NOT_ON_MERCADOLIBRE) });
    await expect(testPrisma.marketplaceListing.count({ where: { connectionId: connection.id } })).resolves.toBe(0);
  });
});
