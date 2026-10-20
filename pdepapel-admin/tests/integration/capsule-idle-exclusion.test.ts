import { CapsuleSlipKind } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store-access", async (importOriginal) => ({ ...(await importOriginal<object>()), requireStoreOwner: vi.fn().mockResolvedValue("owner") }));

import { getDeadInventory } from "@/actions/get-product-profitability";
import { printCapsuleSlips } from "@/lib/capsule-slips";
import { loadKitData } from "@/lib/copiloto/skills/kits-tool";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Plata quieta sin doble conteo: el producto de una edición (su stock son
 * papeles) no aparece, y los papeles impresos no cuentan como quietos en su
 * producto real porque están apartados.
 */
describe("plata quieta con ediciones de cápsulas", () => {
  let f: InventoryFixture | undefined;
  let editionProductId = "";

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

  async function setup() {
    f = await createInventoryFixture();
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    await testPrisma.product.update({ where: { id: f.component.id }, data: { createdAt: old } });
    const editionProduct = await testPrisma.product.create({
      data: {
        name: "Edicion Escritorio",
        slug: `edicion-${f.store.id}`,
        description: "Cápsulas",
        stock: 0,
        price: 12900,
        acqPrice: 0,
        sku: `ED-${f.store.id}`,
        storeId: f.store.id,
        categoryId: f.category.id,
        colorId: f.component.colorId,
        sizeId: f.component.sizeId,
        designId: f.component.designId,
        createdAt: old,
      },
    });
    editionProductId = editionProduct.id;
    const edition = await testPrisma.capsuleEdition.create({
      data: { storeId: f.store.id, number: 1, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 5000 },
    });
    // 4 de los 6 del componente quedan en papeles; la edición queda con 4 cápsulas.
    await printCapsuleSlips({ storeId: f.store.id, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: [{ productId: f.component.id, quantity: 4 }], userId: "paula" });
    return f;
  }

  it("Inteligencia de negocio: sin el producto de la edición y con la plata quieta del disponible", async () => {
    const fixture = await setup();
    const dead = await getDeadInventory(fixture.store.id, 90);
    expect(dead.map((row) => row.id)).not.toContain(editionProductId);
    expect(dead.find((row) => row.id === fixture.component.id)).toMatchObject({ stock: 2, capitalTiedUp: 8000 });
  });

  it("Copiloto (kits para rotar): el producto de la edición no es un producto lento", async () => {
    const fixture = await setup();
    const { products } = await loadKitData(testPrisma as never, fixture.store.id, 90);
    expect(products.map((row) => row.id)).not.toContain(editionProductId);
    expect(products.find((row) => row.id === fixture.component.id)).toMatchObject({ stock: 6, reservedUnits: 4 });
  });
});
