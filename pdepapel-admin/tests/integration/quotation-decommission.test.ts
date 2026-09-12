import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { OrderStatus, OrderType } from "@prisma/client";

/**
 * Retiro de cotizaciones (2026-09-12): el panel ya no crea pedidos de tipo
 * QUOTATION ni emite tokens públicos, pero las cotizaciones que ya existen se
 * siguen mostrando y editando como cualquier pedido.
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

const listRoute = () => import("@/app/api/[storeId]/orders/route");
const singleRoute = () => import("@/app/api/[storeId]/orders/[orderId]/route");

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const customer = { fullName: "Cliente Prueba", phone: "+573001234567", email: "cliente@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };

describe("quotation decommission with MySQL", () => {
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

  it("refuses to create a QUOTATION order and stores nothing", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const before = await testPrisma.order.count({ where: { storeId: fixture.store.id } });
    const { POST } = await listRoute();

    const response = await POST(
      json("POST", { ...customer, type: OrderType.QUOTATION, orderItems: [{ productId: fixture.component.id, quantity: 1 }] }),
      { params: { storeId: fixture.store.id } },
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("ya no se crean");
    expect(await testPrisma.order.count({ where: { storeId: fixture.store.id } })).toBe(before);
  });

  it("creates a custom order without a public token", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { POST } = await listRoute();

    const response = await POST(
      json("POST", {
        ...customer,
        type: OrderType.CUSTOM,
        status: OrderStatus.DRAFT,
        daysValid: 5,
        orderItems: [{ productId: fixture.component.id, quantity: 1 }],
      }),
      { params: { storeId: fixture.store.id } },
    );
    expect(response.status).toBe(200);
    const created = await response.json();
    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(fresh.type).toBe(OrderType.CUSTOM);
    expect(fresh.token).toBeNull();
    expect(fresh.expiresAt).not.toBeNull();
  });

  it("keeps editing an existing quotation without backfilling a token", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const quote = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.QUOTATION,
        type: OrderType.QUOTATION,
        ...customer,
        subtotal: 10000,
        total: 10000,
        orderItems: { create: [{ productId: fixture.component.id, quantity: 1, name: fixture.component.name, price: 10000 }] },
      },
    });
    const { PATCH } = await singleRoute();

    const response = await PATCH(json("PATCH", { adminNotes: "Nota actualizada" }), { params: { storeId: fixture.store.id, orderId: quote.id } });
    expect(response.status).toBe(200);
    const fresh = await testPrisma.order.findUniqueOrThrow({ where: { id: quote.id } });
    expect(fresh.adminNotes).toBe("Nota actualizada");
    expect(fresh.token).toBeNull();
    expect(fresh.type).toBe(OrderType.QUOTATION);
    expect(fresh.status).toBe(OrderStatus.QUOTATION);
  });
});
