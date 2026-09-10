import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { recalculateKitStock } from "@/lib/inventory";
import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

/**
 * Guardas del pedido: un pago no se revierte desde el formulario, un pedido
 * pagado conserva sus productos y precios, un guardado con datos viejos no
 * pisa lo que cambió un webhook, y los kits mueven sus componentes.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
const guideSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { idOrder: 1, tracker: "T" } }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: guideSpy }));

const patchRoute = () => import("@/app/api/[storeId]/orders/[orderId]/route");
const postRoute = () => import("@/app/api/[storeId]/orders/route");
const clearRateRoute = () => import("@/app/api/[storeId]/orders/[orderId]/shipping/clear-rate/route");

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const customer = { fullName: "Cliente Prueba", phone: "+573001234567", email: "cliente@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };

describe("order editing guards with MySQL", () => {
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

  const createPending = async (f: InventoryFixture, extra: Record<string, unknown> = {}) =>
    testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        ...customer,
        subtotal: 20000,
        total: 20000,
        orderItems: { create: [{ productId: f.component.id, quantity: 2, name: f.component.name, price: 10000, sku: f.component.sku ?? "SKU" }] },
        payment: { create: { method: PaymentMethod.BankTransfer, storeId: f.store.id } },
        ...extra,
      },
      include: { orderItems: true },
    });

  it("stamps paidAt and moves kit components when the owner creates an order already paid", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await recalculateKitStock(testPrisma, [fixture.kit.id]); // 6 units / 2 per kit = 3 kits
    const { POST } = await postRoute();
    const response = await POST(
      json("POST", { ...customer, status: OrderStatus.PAID, type: OrderType.STANDARD, payment: { method: PaymentMethod.CASH }, orderItems: [{ productId: fixture.kit.id, quantity: 1 }], subtotal: 10000, total: 10000 }),
      { params: { storeId: fixture.store.id } },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: body.id } });
    expect(order.paidAt).not.toBeNull();
    const component = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(component.stock).toBe(4); // 6 - (1 kit × 2 units)
    const movements = await testPrisma.inventoryMovement.findMany({ where: { referenceId: order.id } });
    expect(movements.map((m) => m.productId).sort()).toEqual([fixture.component.id, fixture.kit.id].sort());
  });

  it("refuses to save over a status that changed since the form was loaded", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const order = await createPending(fixture);
    await testPrisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID, paidAt: new Date() } });
    const { PATCH } = await patchRoute();
    const response = await PATCH(json("PATCH", { expectedStatus: OrderStatus.PENDING, status: OrderStatus.PENDING, adminNotes: "x" }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain("Pagado");
    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.status).toBe(OrderStatus.PAID);
  });

  it("never downgrades a paid order to pending and keeps its items as a snapshot", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const order = await createPending(fixture, { status: OrderStatus.PAID, paidAt: new Date() });
    const { PATCH } = await patchRoute();

    const downgrade = await PATCH(json("PATCH", { status: OrderStatus.PENDING }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(downgrade.status).toBe(400);
    expect(JSON.stringify(await downgrade.json())).toContain("cancela el pedido");

    const itemsChange = await PATCH(json("PATCH", { orderItems: [{ productId: fixture.component.id, quantity: 5 }] }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(itemsChange.status).toBe(400);

    // Same items, new address, and a catalogue price that changed since the sale.
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { price: 99000 } });
    const addressChange = await PATCH(
      json("PATCH", { orderItems: [{ productId: fixture.component.id, quantity: 2 }], address: "Carrera 9 # 9-9", subtotal: 1, total: 1 }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(addressChange.status).toBe(200);
    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { orderItems: true } });
    expect(fresh.address).toBe("Carrera 9 # 9-9");
    expect(fresh.orderItems.map((i) => i.id)).toEqual(order.orderItems.map((i) => i.id));
    expect(fresh.orderItems[0].price).toBe(10000);
    expect(fresh.total).toBe(20000);
    expect(fresh.status).toBe(OrderStatus.PAID);
  });

  it("accepts a status-only update, pays with kit components and restocks them on cancel", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const order = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        ...customer,
        subtotal: 10000,
        total: 10000,
        orderItems: { create: [{ productId: fixture.kit.id, quantity: 1, name: fixture.kit.name, price: 10000, sku: "KIT" }] },
        payment: { create: { method: PaymentMethod.BankTransfer, storeId: fixture.store.id } },
      },
    });
    const { PATCH } = await patchRoute();
    const paid = await PATCH(json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1" } }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(paid.status).toBe(200);
    let component = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(component.stock).toBe(4);
    const afterPay = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(afterPay.paidAt).not.toBeNull();
    expect(afterPay.payment?.transactionId).toBe("REF-1");

    const cancelled = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PAID }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(cancelled.status).toBe(200);
    component = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(component.stock).toBe(6);
  });

  it("only creates the guide when the caller asks for it: saving data never spends money", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const withRate = {
      shipping: { create: { storeId: fixture.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing, envioClickIdRate: 555, cost: 8000, carrierName: "ENVIA" } },
      status: OrderStatus.PAID,
      paidAt: new Date(),
    };
    const order = await createPending(fixture, withRate);
    const { PATCH } = await patchRoute();
    guideSpy.mockClear();

    // A plain save (what «Guardar cambios» sends) carries skipAutoGuide.
    const saved = await PATCH(json("PATCH", { skipAutoGuide: true, address: "Carrera 1 # 2-3" }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(saved.status).toBe(200);
    expect(guideSpy).not.toHaveBeenCalled();
    expect((await saved.json()).guideCreation).toMatchObject({ attempted: false });

    // Confirming the guide in the dialog is what actually asks for it.
    const requested = await PATCH(json("PATCH", { skipAutoGuide: false }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(requested.status).toBe(200);
    expect(guideSpy).toHaveBeenCalledTimes(1);
    expect((await requested.json()).guideCreation).toMatchObject({ attempted: true, success: true });
  });

  it("applies the same transition rules to the list's bulk actions, all or nothing", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const pending = await createPending(fixture);
    const paid = await createPending(fixture, { status: OrderStatus.PAID, paidAt: new Date() });
    const { PATCH } = await postRoute();

    // PAID cannot go back to pending, so the whole batch is refused.
    const back = await PATCH(json("PATCH", { ids: [pending.id, paid.id], status: OrderStatus.PENDING }), { params: { storeId: fixture.store.id } });
    expect(back.status).toBe(400);
    const message = JSON.stringify(await back.json());
    expect(message).toContain(paid.orderNumber);
    expect(message).toContain("No se cambió ninguno");
    const untouched = await testPrisma.order.findUniqueOrThrow({ where: { id: paid.id } });
    expect(untouched.status).toBe(OrderStatus.PAID);

    // A legal batch goes through and does the full accounting.
    const before = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    const ok = await PATCH(json("PATCH", { ids: [pending.id], status: OrderStatus.PAID }), { params: { storeId: fixture.store.id } });
    expect(ok.status).toBe(200);
    const nowPaid = await testPrisma.order.findUniqueOrThrow({ where: { id: pending.id } });
    expect(nowPaid.status).toBe(OrderStatus.PAID);
    expect(nowPaid.paidAt).not.toBeNull();
    const after = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(after.stock).toBe(before.stock - 2);
  });

  it("refuses a bulk shipping change on orders that have no shipment", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const noShipping = await createPending(fixture);
    const { PATCH } = await postRoute();
    const response = await PATCH(json("PATCH", { ids: [noShipping.id], shipping: ShippingStatus.Shipped }), { params: { storeId: fixture.store.id } });
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("no tiene envío");
  });

  it("stops charging a shipping cost whose quote was discarded", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const order = await createPending(fixture, {
      total: 28000,
      shipping: { create: { storeId: fixture.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing, envioClickIdRate: 123, cost: 8000, carrierName: "TCC" } },
    });
    const { DELETE } = await clearRateRoute();
    const response = await DELETE(new Request("http://admin.test/x", { method: "DELETE" }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { shipping: true } });
    expect(fresh.total).toBe(20000);
    expect(fresh.shipping?.envioClickIdRate).toBeNull();
  });
});
