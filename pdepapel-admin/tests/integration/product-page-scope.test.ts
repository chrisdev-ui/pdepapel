import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getProduct } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

vi.mock("@/lib/prismadb", async () => {
  const { testPrisma } = await import("./helpers/database");
  return { default: testPrisma };
});

/**
 * La ficha cargaba el producto solo por id: un id de otra tienda se pintaba
 * dentro del panel equivocado y un id inexistente abría el formulario de
 * creación. Ahora ambos casos devuelven null y la página responde 404.
 */
describe("product page loader is scoped to the store", () => {
  let fixture: InventoryFixture | undefined;
  let other: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    for (const f of [fixture, other]) if (f) await deleteInventoryFixture(f);
    fixture = undefined;
    other = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("returns the product for its own store and null for a foreign or unknown id", async () => {
    fixture = await createInventoryFixture();
    other = await createInventoryFixture();

    const own = await getProduct(fixture.component.id, fixture.store.id);
    expect(own.product?.id).toBe(fixture.component.id);

    const foreign = await getProduct(fixture.component.id, other.store.id);
    expect(foreign.product).toBeNull();

    const unknown = await getProduct("no-existe", fixture.store.id);
    expect(unknown.product).toBeNull();

    const fresh = await getProduct("nuevo", fixture.store.id);
    expect(fresh.product).toBeNull();
    expect(fresh.categories.length).toBeGreaterThan(0);
  });
});
