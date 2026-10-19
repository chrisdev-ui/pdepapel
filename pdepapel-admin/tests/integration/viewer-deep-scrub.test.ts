import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { allocateFairInventory } from "@/lib/fair-events";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));

import { getProduct } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product";
import { GET as getFairEvent } from "@/app/api/[storeId]/fair-events/[fairEventId]/route";

/**
 * Con MySQL: un kit (con su pieza) en la ficha del producto y en una feria.
 * `scrubProduct` y `scrubFairEvent` limpiaban solo el primer nivel, así que
 * la pieza del kit llegaba con costo, transporte y proveedor.
 */
let fixture: InventoryFixture | undefined;
let fairEventId = "";

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  const supplier = await testPrisma.supplier.create({ data: { storeId: fixture.store.id, name: "Henko" } as never });
  await testPrisma.product.update({ where: { id: fixture.component.id }, data: { supplierId: supplier.id, transportationCost: 300, soldCount: 12 } as never });
  const fairEvent = await testPrisma.fairEvent.create({ data: { storeId: fixture.store.id, name: "Feria de kits", createdBy: fixture.store.userId } });
  fairEventId = fairEvent.id;
  await allocateFairInventory({ storeId: fixture.store.id, fairEventId, allocations: [{ productId: fixture.kit.id, quantity: 1 }], userId: fixture.store.userId });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.product.updateMany({ where: { storeId: fixture.store.id }, data: { supplierId: null } });
    await testPrisma.supplier.deleteMany({ where: { storeId: fixture.store.id } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

const signIn = (role: "owner" | "viewer") => {
  session.userId = role === "owner" ? fixture!.store.userId : "user_viewer_deep";
  session.claims = role === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } } : {};
};

describe("piezas de kit para la cuenta de solo lectura (MySQL)", () => {
  it("ficha del kit: ni el kit ni su pieza traen costo, transporte, proveedor ni ventas", async () => {
    signIn("viewer");
    const { product } = await getProduct(fixture!.kit.id, fixture!.store.id);
    assertNoForbiddenKeys(product, "viewer");
    expect(product?.kitComponents[0]).toMatchObject({ component: { id: fixture!.component.id } });
  });

  it("feria con un kit reservado: la fila y sus piezas sin costos", async () => {
    signIn("viewer");
    const response = await getFairEvent(new Request("http://admin.test/x"), { params: { storeId: fixture!.store.id, fairEventId } });
    const body = await response.json();
    assertNoForbiddenKeys(body, "viewer");
    expect(body.inventoryItems[0].kitComponents[0].component).toMatchObject({ id: fixture!.component.id });
  });

  it("la dueña sigue viendo los costos de la pieza", async () => {
    signIn("owner");
    const { product } = await getProduct(fixture!.kit.id, fixture!.store.id);
    expect(product?.kitComponents[0].component).toMatchObject({ transportationCost: 300 });
  });
});
