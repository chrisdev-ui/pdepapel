import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

/**
 * Las ventas presenciales (mostrador y feria) nacen pagadas desde su propio
 * módulo y el de Pedidos no las toca: ni edita, ni cancela, ni elimina, ni
 * de a una ni por lote. Una venta de feria nunca descontó el stock en línea
 * (lo hizo la reserva), así que "reponerla" al cancelar lo duplicaría.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn().mockResolvedValue({ data: { idOrder: 1, tracker: "T" } }) }));

const singleRoute = () => import("@/app/api/[storeId]/orders/[orderId]/route");
const listRoute = () => import("@/app/api/[storeId]/orders/route");

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const customer = { fullName: "Cliente Prueba", phone: "+573001234567", email: "cliente@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };

describe("in-person order guards with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const createOrder = async (f: InventoryFixture, type: OrderType, status: OrderStatus = OrderStatus.PAID) =>
    testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status,
        type,
        paidAt: status === OrderStatus.PAID ? new Date() : null,
        ...customer,
        subtotal: 20000,
        total: 20000,
        orderItems: { create: [{ productId: f.component.id, quantity: 2, name: f.component.name, price: 10000, sku: f.component.sku ?? "SKU" }] },
        payment: { create: { method: PaymentMethod.CASH, storeId: f.store.id } },
      },
    });

  const componentStock = async (f: InventoryFixture) => (await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).stock;

  it("refuses to cancel a fair sale from the order page and leaves online stock untouched", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const fairSale = await createOrder(fixture, OrderType.FESTIVAL);
    const before = await componentStock(fixture);
    const { PATCH } = await singleRoute();

    const cancel = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED }), { params: { storeId: fixture.store.id, orderId: fairSale.id } });
    expect(cancel.status).toBe(409);
    expect(JSON.stringify(await cancel.json())).toContain("desde la feria");

    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: fairSale.id } });
    expect(fresh.status).toBe(OrderStatus.PAID);
    expect(fresh.paidAt).not.toBeNull();
    expect(await componentStock(fixture)).toBe(before);
    expect(await testPrisma.inventoryMovement.count({ where: { referenceId: fairSale.id } })).toBe(0);
  });

  it("refuses to convert an existing order into a fair sale", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const pending = await createOrder(fixture, OrderType.STANDARD, OrderStatus.PENDING);
    const { PATCH } = await singleRoute();
    const response = await PATCH(json("PATCH", { type: OrderType.FESTIVAL }), { params: { storeId: fixture.store.id, orderId: pending.id } });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("desde la feria");
    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: pending.id } });
    expect(fresh.type).toBe(OrderType.STANDARD);
  });

  it("refuses to delete a fair sale and keeps the order", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const fairSale = await createOrder(fixture, OrderType.FESTIVAL);
    const before = await componentStock(fixture);
    const { DELETE } = await singleRoute();

    const response = await DELETE(new Request("http://admin.test/x", { method: "DELETE" }), { params: { storeId: fixture.store.id, orderId: fairSale.id } });
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain("inventario reservado");

    expect(await testPrisma.order.findUnique({ where: { id: fairSale.id } })).not.toBeNull();
    expect(await testPrisma.orderItem.count({ where: { orderId: fairSale.id } })).toBe(1);
    expect(await componentStock(fixture)).toBe(before);
  });

  it("rejects a bulk status change when one of the ids is a fair sale, changing none of them", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const standard = await createOrder(fixture, OrderType.STANDARD);
    const other = await createOrder(fixture, OrderType.STANDARD);
    const fairSale = await createOrder(fixture, OrderType.FESTIVAL);
    const before = await componentStock(fixture);
    const { PATCH } = await listRoute();

    const response = await PATCH(json("PATCH", { ids: [standard.id, fairSale.id, other.id], status: OrderStatus.CANCELLED }), { params: { storeId: fixture.store.id } });
    expect(response.status).toBe(409);
    const body = JSON.stringify(await response.json());
    expect(body).toContain(fairSale.orderNumber);
    expect(body).toContain("No se cambió ninguno");

    const statuses = await testPrisma.order.findMany({ where: { id: { in: [standard.id, other.id, fairSale.id] } }, select: { status: true } });
    expect(statuses.every((order) => order.status === OrderStatus.PAID)).toBe(true);
    expect(await componentStock(fixture)).toBe(before);
    expect(await testPrisma.inventoryMovement.count({ where: { referenceId: { in: [standard.id, other.id, fairSale.id] } } })).toBe(0);
  });

  it("rejects a bulk delete that includes a counter sale, deleting nothing", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const standard = await createOrder(fixture, OrderType.STANDARD);
    const counterSale = await createOrder(fixture, OrderType.POINT_OF_SALE);
    const before = await componentStock(fixture);
    const { DELETE } = await listRoute();

    const response = await DELETE(json("DELETE", { ids: [standard.id, counterSale.id] }), { params: { storeId: fixture.store.id } });
    expect(response.status).toBe(409);
    const body = JSON.stringify(await response.json());
    expect(body).toContain(counterSale.orderNumber);
    expect(body).toContain("venta presencial");

    expect(await testPrisma.order.count({ where: { id: { in: [standard.id, counterSale.id] } } })).toBe(2);
    expect(await componentStock(fixture)).toBe(before);
  });

  it("still lets a standard paid order be cancelled in bulk, restocking it", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const standard = await createOrder(fixture, OrderType.STANDARD);
    const before = await componentStock(fixture);
    const { PATCH } = await listRoute();

    const response = await PATCH(json("PATCH", { ids: [standard.id], status: OrderStatus.CANCELLED }), { params: { storeId: fixture.store.id } });
    expect(response.status).toBe(200);
    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: standard.id } });
    expect(fresh.status).toBe(OrderStatus.CANCELLED);
    expect(await componentStock(fixture)).toBe(before + 2);
  });
});
