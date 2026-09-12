import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

/**
 * Un solo camino para mover el estado de un envío (auditoría inventario y
 * envíos, 2026-09-12): la corrección de manuales cuenta antes de escribir y
 * nunca toca cerrados sin permiso; el pedido sigue al envío solo cuando la
 * transición está permitida; un rastreo sin cambios no reinicia `updatedAt`.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const tracking = vi.hoisted(() => ({ status: "ON_TRANSIT" }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/envioclick", () => ({
  envioClickClient: {
    trackByOrderId: vi.fn(async () => ({ status: "OK", data: [{ status: tracking.status, date: "2026-09-12T10:00:00.000Z" }] })),
  },
}));

const manualRoute = () => import("@/app/api/[storeId]/shipments/bulk-manual-update/route");
const bulkRoute = () => import("@/app/api/[storeId]/shipments/bulk-update/route");
const trackingRoute = () => import("@/app/api/[storeId]/shipments/[shippingId]/update-tracking/route");

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const customer = { fullName: "Cliente", phone: "3000000000", address: "Calle 1", email: "c@test.com" };

describe("estado de envíos y pedidos", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.shipping.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.orderItem.deleteMany({ where: { order: { storeId: fixture.store.id } } });
      await testPrisma.paymentDetails.deleteMany({ where: { storeId: fixture.store.id } }).catch(() => undefined);
      await testPrisma.order.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const createShipment = async (
    f: InventoryFixture,
    {
      orderStatus = OrderStatus.PAID,
      method = PaymentMethod.BankTransfer,
      provider = ShippingProvider.MANUAL,
      status = ShippingStatus.Preparing,
      envioClickIdOrder,
    }: { orderStatus?: OrderStatus; method?: PaymentMethod; provider?: ShippingProvider; status?: ShippingStatus; envioClickIdOrder?: number } = {},
  ) => {
    const order = await testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: orderStatus,
        type: OrderType.STANDARD,
        ...customer,
        subtotal: 10000,
        total: 10000,
        payment: { create: { method, storeId: f.store.id } },
        shipping: { create: { storeId: f.store.id, provider, status, cost: 0, envioClickIdOrder: envioClickIdOrder ?? null } },
      },
      include: { shipping: true },
    });
    return { order, shipping: order.shipping! };
  };

  it("cuenta antes de escribir, deja fuera los cerrados y mueve el pedido a «Enviado»", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const a = await createShipment(fixture);
    const b = await createShipment(fixture);
    const delivered = await createShipment(fixture, { status: ShippingStatus.Delivered, orderStatus: OrderStatus.SENT });
    const { POST } = await manualRoute();
    const params = { params: { storeId: fixture.store.id } };

    const preview = await POST(json("POST", { fromStatus: ShippingStatus.Preparing, toStatus: ShippingStatus.Shipped, dryRun: true }), params);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ count: 2, updated: 0 });
    expect((await testPrisma.shipping.findUniqueOrThrow({ where: { id: a.shipping.id } })).status).toBe(ShippingStatus.Preparing);

    // Entregados: fuera salvo permiso explícito.
    const closed = await POST(json("POST", { fromStatus: ShippingStatus.Delivered, toStatus: ShippingStatus.Preparing, correction: true }), params);
    expect(closed.status).toBe(400);
    expect((await closed.json()).error).toContain("entregados o cancelados");

    // Salto fuera del flujo: exige marcarlo como corrección.
    const jump = await POST(json("POST", { fromStatus: ShippingStatus.Preparing, toStatus: ShippingStatus.Delivered }), params);
    expect(jump.status).toBe(400);
    expect((await jump.json()).error).toContain("corrección");

    const done = await POST(json("POST", { fromStatus: ShippingStatus.Preparing, toStatus: ShippingStatus.Shipped }), params);
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({ count: 2, updated: 2, ordersUpdated: 2 });
    for (const { order, shipping } of [a, b]) {
      expect((await testPrisma.shipping.findUniqueOrThrow({ where: { id: shipping.id } })).status).toBe(ShippingStatus.Shipped);
      expect((await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.SENT);
    }
    expect((await testPrisma.shipping.findUniqueOrThrow({ where: { id: delivered.shipping.id } })).status).toBe(ShippingStatus.Delivered);
  });

  it("la selección valida transiciones, sigue al pedido y nunca revive un pedido cancelado", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const paid = await createShipment(fixture);
    const cancelled = await createShipment(fixture, { orderStatus: OrderStatus.CANCELLED });
    const unpaidTransfer = await createShipment(fixture, { orderStatus: OrderStatus.PENDING });
    const { PATCH } = await bulkRoute();
    const params = { params: { storeId: fixture.store.id } };

    const bad = await PATCH(json("PATCH", { shipmentIds: [paid.shipping.id], status: ShippingStatus.Delivered }), params);
    expect(bad.status).toBe(400);

    const ok = await PATCH(json("PATCH", { shipmentIds: [paid.shipping.id, cancelled.shipping.id, unpaidTransfer.shipping.id], status: ShippingStatus.Shipped }), params);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ updated: 3, ordersUpdated: 1 });
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: paid.order.id } })).status).toBe(OrderStatus.SENT);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: cancelled.order.id } })).status).toBe(OrderStatus.CANCELLED);
    // Transferencia sin pagar: el envío sale pero el pedido sigue pendiente de pago.
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: unpaidTransfer.order.id } })).status).toBe(OrderStatus.PENDING);
  });

  it("un rastreo sin cambios no reinicia updatedAt; con cambio sí, y el pedido sigue", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { order, shipping } = await createShipment(fixture, { provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.InTransit, orderStatus: OrderStatus.PAID, envioClickIdOrder: 4321 });
    const stale = new Date("2026-09-01T00:00:00.000Z");
    await testPrisma.shipping.update({ where: { id: shipping.id }, data: { updatedAt: stale } });
    const { POST } = await trackingRoute();
    const params = { params: { storeId: fixture.store.id, shippingId: shipping.id } };

    tracking.status = "ON_TRANSIT";
    const same = await POST(new Request("http://admin.test", { method: "POST" }), params);
    expect(same.status).toBe(200);
    expect((await same.json()).changed).toBe(false);
    expect((await testPrisma.shipping.findUniqueOrThrow({ where: { id: shipping.id } })).updatedAt.getTime()).toBe(stale.getTime());

    tracking.status = "DELIVERED";
    const moved = await POST(new Request("http://admin.test", { method: "POST" }), params);
    expect(moved.status).toBe(200);
    const after = await testPrisma.shipping.findUniqueOrThrow({ where: { id: shipping.id } });
    expect(after.status).toBe(ShippingStatus.Delivered);
    expect(after.updatedAt.getTime()).toBeGreaterThan(stale.getTime());
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.SENT);
  });
});
