import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderInventoryIssueKind, OrderStatus, OrderType, PaymentMethod, StockReservationStatus } from "@prisma/client";

import { availableStock } from "@/lib/available-stock";
import { createGuideRecordingFailure } from "@/lib/guide-background";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Dos pedidos web pendientes por la misma última unidad: el segundo pago no
 * vende lo que no hay. Queda pagado (la plata entró) pero con la incidencia
 * abierta, sin guía automática y con aviso a Paula. Y una venta pagada que se
 * lleva unidades apartadas gana, y el apartado queda «sin respaldo».
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const alerts = vi.hoisted(() => ({ shortfall: vi.fn(), unbacked: vi.fn(), guide: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: alerts.guide }));
vi.mock("@/lib/stock-review-alerts", () => ({ notifyStockShortfall: alerts.shortfall, notifyUnbackedReservations: alerts.unbacked }));

const json = (body: unknown) => new Request("http://admin.test/api/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("pago sin unidades (MySQL)", () => {
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
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const pendingOrder = (f: InventoryFixture, quantity: number) =>
    testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        fullName: "Clienta Prueba",
        phone: "+573001234567",
        email: "clienta@prueba.test",
        address: "Calle 1 # 2-3",
        city: "Medellín",
        department: "Antioquia",
        subtotal: 10000 * quantity,
        total: 10000 * quantity,
        orderItems: { create: [{ productId: f.component.id, quantity, name: f.component.name, price: 10000, sku: f.component.sku }] },
        payment: { create: { method: PaymentMethod.BankTransfer, storeId: f.store.id } },
      },
    });

  const markPaid = async (f: InventoryFixture, orderId: string) => {
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    return PATCH(
      json({ status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: `REF-${orderId}` } }),
      { params: { storeId: f.store.id, orderId } },
    );
  };

  it("el segundo pago por la última unidad queda en revisión: sin descontar, sin guía y con aviso", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const first = await pendingOrder(fixture, 6);
    const second = await pendingOrder(fixture, 6);

    expect((await markPaid(fixture, first.id)).status).toBe(200);
    expect((await markPaid(fixture, second.id)).status).toBe(200);

    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(product.stock).toBe(0);
    const issues = await testPrisma.orderInventoryIssue.findMany({ where: { storeId: fixture.store.id, resolvedAt: null } });
    expect(issues).toEqual([expect.objectContaining({ orderId: second.id, kind: OrderInventoryIssueKind.DECREMENT, quantity: 6 })]);

    await vi.waitFor(() => expect(alerts.shortfall).toHaveBeenCalledWith(fixture!.store.id, second.id));
    expect(alerts.shortfall).not.toHaveBeenCalledWith(fixture.store.id, first.id);

    await expect(createGuideRecordingFailure({ orderId: second.id, storeId: fixture.store.id, source: "prueba" })).resolves.toBe(false);
    expect(alerts.guide).not.toHaveBeenCalled();
  });

  it("una venta pagada se lleva las unidades apartadas: la venta queda y el apartado, sin respaldo", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { stock: 1, reservedUnits: 1 } });
    const hold = await testPrisma.stockReservation.create({
      data: {
        storeId: fixture.store.id,
        productId: fixture.component.id,
        quantity: 1,
        customerName: "Clienta del grupo",
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
      },
    });
    const order = await pendingOrder(fixture, 1);

    expect((await markPaid(fixture, order.id)).status).toBe(200);

    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(product).toMatchObject({ stock: 0, reservedUnits: 1 });
    expect(availableStock(product)).toBe(0);
    const flagged = await testPrisma.stockReservation.findUniqueOrThrow({ where: { id: hold.id } });
    expect(flagged.status).toBe(StockReservationStatus.ACTIVE);
    expect(flagged.unbackedAt).toBeInstanceOf(Date);
    await vi.waitFor(() => expect(alerts.unbacked).toHaveBeenCalledWith([hold.id]));
    await expect(testPrisma.orderInventoryIssue.count({ where: { orderId: order.id } })).resolves.toBe(0);
  });
});
