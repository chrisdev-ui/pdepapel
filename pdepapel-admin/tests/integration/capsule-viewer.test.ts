import { CapsuleSlipKind, OrderStatus, PaymentMethod } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys, findForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));

import { getProduct } from "@/app/(dashboard)/[storeId]/(routes)/productos/[productId]/server/get-product";
import { getCapsuleWorkspace } from "@/app/(dashboard)/[storeId]/(routes)/productos/capsulas/server/get-capsule-workspace";
import { printCapsuleSlips } from "@/lib/capsule-slips";
import { scrubCapsulePayload } from "@/lib/viewer-payloads";

/**
 * La cuenta de solo lectura no ve costos, banda, tope del regalo ni costo
 * provisional o real de las cápsulas. Con MySQL: una edición con papeles,
 * regalos, una impresión y un pedido de cápsulas.
 */
let fixture: InventoryFixture | undefined;
let editionId = "";
let editionProductId = "";

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  const product = await testPrisma.product.create({
    data: { name: "Edicion Escritorio", slug: `edicion-${store}`, description: "Cápsulas", stock: 0, price: 12900, acqPrice: 0, sku: `ED-${store}`, storeId: store, categoryId: fixture.category.id, colorId: fixture.component.colorId, sizeId: fixture.component.sizeId, designId: fixture.component.designId },
  });
  editionProductId = product.id;
  const edition = await testPrisma.capsuleEdition.create({ data: { storeId: store, number: 1, name: "Escritorio", theme: "escritorio", productId: product.id, costBandMin: 3000, costBandMax: 5000 } });
  editionId = edition.id;
  await testPrisma.capsulePackOption.create({ data: { editionId, packSize: 10, giftMaxCost: 2000, giftMaxItems: 1, giftLabel: "1 producto de regalo", boxReserveCost: 1000 } });
  await printCapsuleSlips({ storeId: store, editionId, kind: CapsuleSlipKind.SLIP, items: [{ productId: fixture.component.id, quantity: 2 }], userId: fixture.store.userId });
  const order = await testPrisma.order.create({
    data: { storeId: store, orderNumber: `CAP-V-${store.slice(0, 6)}`, status: OrderStatus.PAID, subtotal: 64500, total: 64500, totalProductCost: 20000, netProfit: 40000, payment: { create: { method: PaymentMethod.Bold, storeId: store } } },
  });
  await testPrisma.capsuleOrder.create({ data: { storeId: store, orderId: order.id, editionId, packSize: 5, provisionalCost: 20000 } });
});

afterAll(async () => {
  if (fixture) await deleteInventoryFixture(fixture);
  await testPrisma.$disconnect();
});

const signIn = (role: "owner" | "viewer") => {
  session.userId = role === "owner" ? fixture!.store.userId : "user_viewer_capsules";
  session.claims = role === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } } : {};
};

describe("cápsulas para la cuenta de solo lectura (MySQL)", () => {
  it("una edición completa limpia no trae banda, costos de papel, tope del regalo ni costo provisional", async () => {
    const raw = await testPrisma.capsuleEdition.findUniqueOrThrow({
      where: { id: editionId },
      include: { product: true, packOptions: true, slips: true, batches: { include: { items: true } }, orders: { include: { order: true } } },
    });
    // Sin limpiar, la prueba sí encuentra la plata de la casa: el detector mira lo que importa.
    expect(findForbiddenKeys(raw, "viewer")).toEqual(expect.arrayContaining(["costBandMin", "product.acqPrice", "slips[0].unitCost", "orders[0].provisionalCost", "packOptions[0].giftMaxCost", "packOptions[0].boxReserveCost"]));
    const clean = scrubCapsulePayload(raw);
    assertNoForbiddenKeys(clean, "viewer");
    expect(clean).toMatchObject({ name: "Escritorio", slips: [expect.objectContaining({ code: expect.any(String) }), expect.anything()], packOptions: [{ packSize: 10, giftLabel: "1 producto de regalo" }] });
  });

  it("la ficha del producto de la edición sale sin su costo (la media de los papeles)", async () => {
    signIn("viewer");
    const { product } = await getProduct(editionProductId, fixture!.store.id);
    assertNoForbiddenKeys(product, "viewer");
    signIn("owner");
    const owner = await getProduct(editionProductId, fixture!.store.id);
    expect(owner.product).toMatchObject({ acqPrice: 4000 });
  });

  it("la pantalla de empaque de cápsulas es solo de la dueña", async () => {
    signIn("viewer");
    await expect(getCapsuleWorkspace(fixture!.store.id)).rejects.toBeTruthy();
  });
});
