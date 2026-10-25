import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderInventoryIssueKind, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El camino compartido de cobro contra MySQL real: webhook y conciliación
 * aplican una sola vez en cualquier orden y en paralelo; anular un pagado
 * reingresa una vez; y un pago tardío sobre un cancelado lo reactiva aunque
 * el stock ya se haya vendido: queda pagado, sin negativos y con la
 * incidencia DECREMENT («pagado sin stock»).
 */
const alerts = vi.hoisted(() => ({ revival: vi.fn(), shortfall: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn().mockResolvedValue({ data: { id: "x" }, error: null }) } } }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn() }));
vi.mock("@/lib/stock-review-alerts", () => ({ notifyStockShortfall: alerts.shortfall, notifyUnbackedReservations: vi.fn() }));
vi.mock("@/lib/late-payment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/late-payment")>()),
  notifyLatePaymentRevival: alerts.revival,
}));
vi.mock("@/lib/bold", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bold")>()),
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: () => true,
}));

const NOW = new Date();

async function boldOrder(f: InventoryFixture, quantity: number, status: OrderStatus = OrderStatus.PENDING) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID().slice(0, 8)}`,
      status,
      type: OrderType.STANDARD,
      fullName: "Clienta Prueba",
      phone: "+573001234567",
      email: "clienta@prueba.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      subtotal: 10000 * quantity,
      total: 10000 * quantity,
      createdAt: new Date(NOW.getTime() - 30 * 60 * 1000),
      orderItems: { create: [{ productId: f.component.id, quantity, name: f.component.name, price: 10000, sku: f.component.sku }] },
      payment: { create: { method: PaymentMethod.Bold, storeId: f.store.id } },
    },
  });
}

async function webhook(order: { orderNumber: string; total: number }, type = "SALE_APPROVED") {
  const { POST } = await import("@/app/api/webhook/bold/route");
  return POST(
    new Request("http://admin.test/api/webhook/bold", {
      method: "POST",
      headers: { "content-type": "application/json", "x-bold-signature": "firma" },
      body: JSON.stringify({ type, data: { metadata: { reference: order.orderNumber }, payment_id: `TX-${order.orderNumber}`, amount: { total: order.total, currency: "COP" } } }),
    }),
  );
}

/** Bold responde aprobado solo para los pedidos de esta prueba; cualquier otro, 404. */
function boldGateway(orders: { orderNumber: string; total: number }[]) {
  return vi.fn(async (url: string) => {
    const reference = decodeURIComponent(url.split("/").pop() ?? "");
    const order = orders.find((candidate) => candidate.orderNumber === reference);
    if (!url.includes("bold.co")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (!order) return new Response(JSON.stringify({ errors: [] }), { status: 404 });
    return new Response(
      JSON.stringify({ transaction_id: `TX-${reference}`, reference_id: reference, total: order.total, payment_status: "APPROVED", transaction_date: new Date(NOW.getTime() - 20 * 60 * 1000).toISOString() }),
      { status: 200 },
    );
  });
}

async function reconcile(orders: { orderNumber: string; total: number }[]) {
  const { runPaymentReconciliation } = await import("@/lib/payment-reconciliation");
  return runPaymentReconciliation({
    now: NOW,
    fetch: boldGateway(orders) as unknown as typeof fetch,
    wompi: { baseUrl: "https://sandbox.wompi.co/v1", privateKey: "prv_test" },
    bold: { identityKey: "identity" },
    alerts: { enabled: false },
  });
}

const stockOf = async (f: InventoryFixture) => (await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id } })).stock;
const saleMovements = (orderId: string) => testPrisma.inventoryMovement.count({ where: { referenceId: orderId, quantity: { lt: 0 } } });

describe("liquidación compartida de pagos (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.paymentWebhookEvent.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("webhook y luego conciliación: un solo descuento, un solo paidAt, sin fila de conciliación", async () => {
    fixture = await createInventoryFixture();
    const order = await boldOrder(fixture, 2);
    expect((await webhook(order)).status).toBe(200);
    const paidAt = (await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).paidAt;

    await reconcile([order]);

    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe(OrderStatus.PAID);
    expect(after.paidAt).toEqual(paidAt);
    expect(await stockOf(fixture)).toBe(4);
    expect(await saleMovements(order.id)).toBe(1);
    expect(await testPrisma.paymentWebhookEvent.count({ where: { orderId: order.id, eventType: { startsWith: "reconcile:" } } })).toBe(0);
  });

  it("conciliación y luego webhook: un solo descuento y el webhook responde «ya procesada»", async () => {
    fixture = await createInventoryFixture();
    const order = await boldOrder(fixture, 2);
    const summary = await reconcile([order]);
    expect(summary.paid).toBe(1);

    const response = await webhook(order);
    await expect(response.json()).resolves.toEqual({ message: `Orden ${order.orderNumber} ya fue procesada anteriormente` });
    expect(await stockOf(fixture)).toBe(4);
    expect(await saleMovements(order.id)).toBe(1);
    expect(await testPrisma.paymentWebhookEvent.findFirst({ where: { orderId: order.id, eventType: "reconcile:APPROVED" } })).toMatchObject({ status: "PROCESSED" });
  });

  it("varios pagos del mismo producto conciliados a la vez: ninguno se pierde por deadlock", async () => {
    fixture = await createInventoryFixture();
    const orders = await Promise.all([boldOrder(fixture, 1), boldOrder(fixture, 1), boldOrder(fixture, 1)]);
    const summary = await reconcile(orders);
    expect(summary).toMatchObject({ paid: 3, failed: 0 });
    expect(await stockOf(fixture)).toBe(3);
    for (const order of orders) expect(await saleMovements(order.id)).toBe(1);
  });

  it("un pagado que Bold anuló después: la conciliación lo cancela, reingresa una vez y no repite", async () => {
    fixture = await createInventoryFixture();
    const order = await boldOrder(fixture, 2);
    expect((await webhook(order)).status).toBe(200);
    expect(await stockOf(fixture)).toBe(4);
    // Solo esta referencia está anulada: la revisión cubre todos los pagados recientes de la base.
    const voided = vi.fn(async (url: string) =>
      url.includes("bold.co") && decodeURIComponent(url.split("/").pop() ?? "") === order.orderNumber
        ? new Response(JSON.stringify({ transaction_id: `TX-${order.orderNumber}`, reference_id: order.orderNumber, total: order.total, payment_status: "VOIDED", transaction_date: NOW.toISOString() }), { status: 200 })
        : url.includes("bold.co")
          ? new Response(JSON.stringify({ errors: [] }), { status: 404 })
          : new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const { runPaymentReconciliation } = await import("@/lib/payment-reconciliation");
    const run = () => runPaymentReconciliation({ now: NOW, fetch: voided as unknown as typeof fetch, wompi: { baseUrl: "https://sandbox.wompi.co/v1", privateKey: "prv_test" }, bold: { identityKey: "identity" }, alerts: { enabled: false } });

    expect(await run()).toMatchObject({ voided: 1, failed: 0 });
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe(OrderStatus.CANCELLED);
    expect(after.paidAt).toBeNull();
    expect(await stockOf(fixture)).toBe(6);

    expect(await run()).toMatchObject({ voided: 0 });
    expect(await stockOf(fixture)).toBe(6);
    expect(await testPrisma.paymentWebhookEvent.count({ where: { orderId: order.id, eventType: "reconcile:VOIDED" } })).toBe(1);
  });

  it("webhook y conciliación al mismo tiempo: un solo reclamo", async () => {
    fixture = await createInventoryFixture();
    const order = await boldOrder(fixture, 1);
    await Promise.allSettled([webhook(order), reconcile([order])]);
    expect(await stockOf(fixture)).toBe(5);
    expect(await saleMovements(order.id)).toBe(1);
  });

  it("anular un pagado reingresa una vez y conserva el cupón en el pedido", async () => {
    fixture = await createInventoryFixture();
    const order = await boldOrder(fixture, 2);
    await webhook(order);
    await webhook(order, "VOID_APPROVED");
    await webhook(order, "VOID_APPROVED");
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: OrderStatus.CANCELLED, paidAt: null });
    expect(await stockOf(fixture)).toBe(6);
    expect(await testPrisma.inventoryMovement.count({ where: { referenceId: order.id, quantity: { gt: 0 } } })).toBe(1);
  });

  it("pago tardío sobre un cancelado cuyo stock ya se vendió: pagado sin stock, sin negativos, con incidencia y aviso", async () => {
    fixture = await createInventoryFixture();
    const order = await boldOrder(fixture, 2, OrderStatus.CANCELLED);
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { stock: 1 } });

    expect((await webhook(order)).status).toBe(200);

    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe(OrderStatus.PAID);
    expect(after.paidAt).toBeInstanceOf(Date);
    expect(await stockOf(fixture)).toBe(1);
    expect(await saleMovements(order.id)).toBe(0);
    const issues = await testPrisma.orderInventoryIssue.findMany({ where: { orderId: order.id, resolvedAt: null } });
    expect(issues).toEqual([expect.objectContaining({ kind: OrderInventoryIssueKind.DECREMENT, quantity: 2, productId: fixture.component.id })]);
    await vi.waitFor(() => expect(alerts.revival).toHaveBeenCalledWith({ orderId: order.id, provider: "Bold", stockShortfall: 1 }));
    expect(alerts.revival).toHaveBeenCalledTimes(1);
    expect(alerts.shortfall).not.toHaveBeenCalled();
  });

  it("una tarjeta de regalo cancelada no revive con un pago tardío", async () => {
    fixture = await createInventoryFixture();
    const order = await boldOrder(fixture, 1, OrderStatus.CANCELLED);
    await testPrisma.order.update({ where: { id: order.id }, data: { type: OrderType.GIFT_CARD } });
    await webhook(order);
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe(OrderStatus.CANCELLED);
    expect(after.riskReasons ?? "").toContain("pago-en-cancelado");
    expect(alerts.revival).not.toHaveBeenCalled();
  });
});
