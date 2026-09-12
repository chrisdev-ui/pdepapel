import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { RestockOrderStatus } from "@prisma/client";

/**
 * Aprovisionamiento (auditoría Grupo B): números que no se reutilizan,
 * recepción con tope y clave de idempotencia, ciclo de vida con transiciones
 * fijas y costos que llegan al producto.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));

const collectionRoute = () => import("@/app/api/[storeId]/restock-orders/route");
const detailRoute = () => import("@/app/api/[storeId]/restock-orders/[orderId]/route");
const receiveRoute = () => import("@/app/api/[storeId]/restock-orders/[orderId]/receive/route");

const json = (method: string, body: unknown, url = "http://admin.test/api/x") =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("pedidos de aprovisionamiento", () => {
  let fixture: InventoryFixture | undefined;
  let supplierId = "";

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.restockOrderReceipt.deleteMany({ where: { storeId: fixture.store.id } });
      const orders = await testPrisma.restockOrder.findMany({ where: { storeId: fixture.store.id }, select: { id: true } });
      await testPrisma.restockOrderItem.deleteMany({ where: { restockOrderId: { in: orders.map((o) => o.id) } } });
      await testPrisma.restockOrder.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.product.updateMany({ where: { storeId: fixture.store.id }, data: { supplierId: null } });
      await testPrisma.supplier.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const setup = async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const supplier = await testPrisma.supplier.create({ data: { storeId: fixture.store.id, name: `Proveedor ${randomUUID()}` } });
    supplierId = supplier.id;
    return fixture;
  };

  const createOrder = async (f: InventoryFixture, extra: Record<string, unknown> = {}) => {
    const { POST } = await collectionRoute();
    const response = await POST(
      json("POST", { supplierId, shippingCost: 6000, items: [{ productId: f.component.id, quantity: 2, cost: 30000 }], ...extra }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    return response.json();
  };

  const componentStock = async (f: InventoryFixture) => (await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).stock;

  it("numera desde el mayor existente y nunca reutiliza un número borrado", async () => {
    const f = await setup();
    const first = await createOrder(f);
    const second = await createOrder(f);
    expect(first.orderNumber).toBe("PO-0001");
    expect(second.orderNumber).toBe("PO-0002");

    const { DELETE } = await detailRoute();
    const deleted = await DELETE(new Request("http://admin.test", { method: "DELETE" }), { params: { storeId: f.store.id, orderId: first.id } });
    expect(deleted.status).toBe(200);

    const third = await createOrder(f);
    expect(third.orderNumber).toBe("PO-0003");
  });

  it("recibe con tope, no repite una recepción y lleva el costo al producto", async () => {
    const f = await setup();
    const order = await createOrder(f);
    const itemId = order.items[0].id as string;
    const { POST: receive } = await receiveRoute();
    const { PATCH } = await detailRoute();
    const params = { params: { storeId: f.store.id, orderId: order.id as string } };

    // Un borrador no recibe mercancía.
    const draft = await receive(json("POST", { idempotencyKey: randomUUID(), lines: [{ restockOrderItemId: itemId, quantity: 1 }] }), params);
    expect(draft.status).toBe(409);

    const ordered = await PATCH(json("PATCH", { status: RestockOrderStatus.ORDERED }), params);
    expect(ordered.status).toBe(200);

    const key = randomUUID();
    const partial = await receive(json("POST", { idempotencyKey: key, lines: [{ restockOrderItemId: itemId, quantity: 1 }] }), params);
    expect(partial.status).toBe(200);
    const partialBody = await partial.json();
    expect(partialBody.status).toBe(RestockOrderStatus.PARTIALLY_RECEIVED);
    expect(await componentStock(f)).toBe(7);

    // Reintento con la misma clave: nada cambia.
    const replay = await receive(json("POST", { idempotencyKey: key, lines: [{ restockOrderItemId: itemId, quantity: 1 }] }), params);
    expect(replay.status).toBe(409);
    expect(await componentStock(f)).toBe(7);

    // Falta 1: recibir 2 exige confirmar el excedente.
    const capped = await receive(json("POST", { idempotencyKey: randomUUID(), lines: [{ restockOrderItemId: itemId, quantity: 2 }] }), params);
    expect(capped.status).toBe(400);
    expect((await capped.json()).error).toContain("Confirma el excedente");
    expect(await componentStock(f)).toBe(7);

    const excess = await receive(
      json("POST", { idempotencyKey: randomUUID(), lines: [{ restockOrderItemId: itemId, quantity: 2, allowExcess: true }] }),
      params,
    );
    expect(excess.status).toBe(200);
    const excessBody = await excess.json();
    expect(excessBody.status).toBe(RestockOrderStatus.COMPLETED);
    expect(excessBody.receipt.excessUnits).toBe(1);
    expect(await componentStock(f)).toBe(9);

    // Costo puesto en bodega: 30000 de mercancía + 6000 de envío sobre 60000 → 10 %.
    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } });
    expect(product.acqPrice).toBe(30000);
    expect(product.transportationCost).toBe(3000);
    expect(product.supplierId).toBe(supplierId);
    const movements = await testPrisma.inventoryMovement.findMany({ where: { referenceId: order.id, type: "RESTOCK_RECEIVED" } });
    expect(movements).toHaveLength(2);
    expect(movements.every((movement) => movement.cost === 33000)).toBe(true);

    // Completado: ya no recibe.
    const closed = await receive(json("POST", { idempotencyKey: randomUUID(), lines: [{ restockOrderItemId: itemId, quantity: 1 }] }), params);
    expect(closed.status).toBe(409);
  });

  it("no cancela con mercancía recibida, guarda notas aparte y fija las líneas al pedir", async () => {
    const f = await setup();
    const order = await createOrder(f, { status: RestockOrderStatus.ORDERED });
    const itemId = order.items[0].id as string;
    const params = { params: { storeId: f.store.id, orderId: order.id as string } };
    const { PATCH } = await detailRoute();
    const { POST: receive } = await receiveRoute();

    const lines = await PATCH(json("PATCH", { items: [{ productId: f.component.id, quantity: 5, cost: 1 }] }), params);
    expect(lines.status).toBe(400);
    expect((await lines.json()).error).toContain("solo cambian las notas");

    const notes = await PATCH(json("PATCH", { notes: "Llega en dos entregas" }), params);
    expect(notes.status).toBe(200);
    expect((await notes.json()).notes).toBe("Llega en dos entregas");

    const partial = await receive(json("POST", { idempotencyKey: randomUUID(), lines: [{ restockOrderItemId: itemId, quantity: 1 }] }), params);
    expect(partial.status).toBe(200);

    const cancel = await PATCH(json("PATCH", { status: RestockOrderStatus.CANCELLED }), params);
    expect(cancel.status).toBe(400);
    expect((await cancel.json()).error).toContain("ya se recibieron 1 unidades");

    // Cerrar corto sí se puede: lo que falta no llegará.
    const close = await PATCH(json("PATCH", { status: RestockOrderStatus.COMPLETED }), params);
    expect(close.status).toBe(200);
    expect((await close.json()).status).toBe(RestockOrderStatus.COMPLETED);
  });

  it("no ve ni edita pedidos de otra tienda", async () => {
    const f = await setup();
    const order = await createOrder(f);
    const other = await testPrisma.store.create({ data: { name: `Otra ${randomUUID()}`, userId: `other-${randomUUID()}` } });
    try {
      session.userId = other.userId;
      const { GET, PATCH } = await detailRoute();
      const params = { params: { storeId: other.id, orderId: order.id as string } };
      expect((await GET(new Request("http://admin.test"), params)).status).toBe(404);
      expect((await PATCH(json("PATCH", { notes: "x" }), params)).status).toBe(404);
    } finally {
      await testPrisma.store.delete({ where: { id: other.id } });
    }
  });
});
