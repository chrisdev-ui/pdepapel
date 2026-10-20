import { CapsuleSlipKind, OrderStatus, PaymentMethod } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", async (importOriginal) => ({ ...(await importOriginal<object>()), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));

import { CAPSULE_DRAW_PENDING_MESSAGE } from "@/lib/capsule-shipping-guard";
import { drawCapsuleSlip, printCapsuleSlips } from "@/lib/capsule-slips";
import { createGuideForOrder } from "@/lib/shipping-helpers";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Un pedido de cápsulas no pasa a «Enviado» ni compra guía hasta cerrar su
 * sorteo; y un pedido ya enviado no saca papeles.
 */
let f: InventoryFixture | undefined;

async function setup() {
  f = await createInventoryFixture();
  const store = f.store.id;
  const editionProduct = await testPrisma.product.create({
    data: { name: "Edicion", slug: `edicion-${store}`, description: "Cápsulas", stock: 0, price: 12900, acqPrice: 0, sku: `ED-${store}`, storeId: store, categoryId: f.category.id, colorId: f.component.colorId, sizeId: f.component.sizeId, designId: f.component.designId, isArchived: true },
  });
  const edition = await testPrisma.capsuleEdition.create({ data: { storeId: store, number: 1, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 5000 } });
  const order = await testPrisma.order.create({
    data: {
      storeId: store,
      orderNumber: `CAP-${randomBytes(4).toString("hex")}`,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      fullName: "Ana Pérez",
      phone: "3000000000",
      email: "ana@prueba.test",
      address: "Calle 1",
      subtotal: 64500,
      total: 64500,
      payment: { create: { method: PaymentMethod.Bold, storeId: store } },
      shipping: { create: { storeId: store, cost: 0 } },
    },
  });
  await testPrisma.capsuleOrder.create({ data: { storeId: store, orderId: order.id, editionId: edition.id, packSize: 5, provisionalCost: 20000 } });
  session.userId = f.store.userId;
  return { order, edition };
}

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

describe("un pedido de cápsulas no sale sin cerrar el sorteo", () => {
  it("la guía se niega antes de hablar con EnvioClick", async () => {
    const { order } = await setup();
    await expect(createGuideForOrder(order.id, f!.store.id)).rejects.toMatchObject({ statusCode: 409, message: CAPSULE_DRAW_PENDING_MESSAGE });
  });

  it("«Enviado» en lote se niega con el sorteo abierto y pasa con el sorteo cerrado", async () => {
    const { order } = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/orders/route");
    const send = () =>
      PATCH(new Request("https://admin.test/x", { method: "PATCH", body: JSON.stringify({ ids: [order.id], status: OrderStatus.SENT }) }), { params: { storeId: f!.store.id } });
    const refused = await send();
    expect(refused.status).toBe(409);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: OrderStatus.PAID });

    await testPrisma.capsuleOrder.update({ where: { orderId: order.id }, data: { drawCompletedAt: new Date() } });
    const sent = await send();
    expect(sent.status).toBe(200);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: OrderStatus.SENT });
  });

  it("«Marcar como enviado» en el pedido se niega con el sorteo abierto", async () => {
    const { order } = await setup();
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const response = await PATCH(
      new Request("https://admin.test/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: OrderStatus.SENT, expectedStatus: OrderStatus.PAID }) }),
      { params: { storeId: f!.store.id, orderId: order.id } },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: CAPSULE_DRAW_PENDING_MESSAGE });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: OrderStatus.PAID });
  });

  it("un pedido ya enviado no saca papeles", async () => {
    const { order, edition } = await setup();
    await printCapsuleSlips({ storeId: f!.store.id, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: [{ productId: f!.component.id, quantity: 2 }], userId: "paula" });
    const [slip] = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id } });
    await testPrisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.SENT } });
    await expect(drawCapsuleSlip({ storeId: f!.store.id, orderId: order.id, code: slip.code, userId: "paula" })).rejects.toMatchObject({ statusCode: 409 });
  });
});
