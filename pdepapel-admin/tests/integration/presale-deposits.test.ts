import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NotificationChannel,
  OrderNotificationStatus,
  OrderPaymentKind,
  OrderPaymentPlan,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PreorderWaitlistChannel,
  PreorderWaitlistStatus,
  PresaleDepositType,
  PresalePaymentMode,
  ProductPresaleStatus,
  ShippingProvider,
  ShippingStatus,
} from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Preventa con anticipo contra MySQL real (Lote 1): el anticipo por pasarela
 * llega con su propia referencia y deja el pedido «Anticipo recibido» sin
 * `paidAt` ni inventario; ningún pago con la referencia del pedido lo da por
 * pagado completo; el anticipo a mano no avisa por defecto; el cambio de
 * estado genérico no salta el saldo; el saldo solo entra con la preventa
 * liberada y deja el pedido pagado; la conciliación nunca toma un pedido con
 * anticipo como candidato a cancelar.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const emails = vi.hoisted(() => ({ order: vi.fn() }));
const analytics = vi.hoisted(() => ({ deposit: vi.fn(), purchase: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendOrderEmail: emails.order, sendPaymentDeclinedEmail: vi.fn() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/whatsapp/send", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWhatsAppTemplateMessage: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordPaidOrderInGoogleAnalytics: analytics.purchase,
  recordDepositInGoogleAnalytics: analytics.deposit,
}));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/envioclick")>()), envioClickClient: { createShipment: vi.fn(), quoteShipment: vi.fn() } }));
vi.mock("@/lib/resource-lock", () => ({ withResourceLock: (_k: string, _m: string, run: () => Promise<unknown>) => run(), ResourceBusyError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));
vi.mock("@/lib/bold", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bold")>()),
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: () => true,
}));

const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: body === undefined ? undefined : JSON.stringify(body) });

let f: InventoryFixture;
let calendarId = "";
let presaleId = "";

async function flushBackground() {
  while (background.pending.length > 0) await Promise.all(background.pending.splice(0));
}

const UNIT_PRICE = 16000;
const UNIT_DEPOSIT = 3000;

/** Pedido de la tienda con anticipo, pendiente, con el cobro del anticipo listo como lo deja el checkout. */
async function depositOrder(quantity = 1, method: PaymentMethod = PaymentMethod.Bold) {
  const orderNumber = `ORD-DEP-${randomUUID().slice(0, 8)}`;
  const order = await testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber,
      status: OrderStatus.PENDING,
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      paymentPlan: OrderPaymentPlan.DEPOSIT,
      depositAmount: UNIT_DEPOSIT * quantity,
      preorderTermsVersion: "2026-10-28",
      fullName: "Clienta Anticipo",
      phone: "+573001112233",
      email: "clienta-anticipo@prueba.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      subtotal: UNIT_PRICE * quantity,
      total: UNIT_PRICE * quantity,
      orderItems: { create: [{ productId: calendarId, name: "Calendario", quantity, price: UNIT_PRICE, isPreorder: true, presaleId }] },
      payment: { create: { storeId: f.store.id, method } },
      shipping: { create: { storeId: f.store.id, provider: ShippingProvider.MANUAL, status: ShippingStatus.Preparing, cost: 0 } },
    },
  });
  if (method !== PaymentMethod.BankTransfer) {
    await testPrisma.orderPayment.create({
      data: {
        storeId: f.store.id,
        orderId: order.id,
        kind: OrderPaymentKind.DEPOSIT,
        status: OrderPaymentStatus.PENDING,
        amount: UNIT_DEPOSIT * quantity,
        method,
        gatewayReference: `${orderNumber}-A`,
        createdBy: "SYSTEM",
      },
    });
  }
  return order;
}

async function boldWebhook(reference: string, total: number, type = "SALE_APPROVED") {
  const { POST } = await import("@/app/api/webhook/bold/route");
  const response = await POST(
    new Request("http://admin.test/api/webhook/bold", {
      method: "POST",
      headers: { "content-type": "application/json", "x-bold-signature": "firma" },
      body: JSON.stringify({ type, data: { metadata: { reference }, payment_id: `TX-${reference}`, amount: { total, currency: "COP" } } }),
    }),
  );
  await flushBackground();
  return response;
}

const presaleRow = () => testPrisma.productPresale.findUniqueOrThrow({ where: { id: presaleId } });
const calendarMoves = () => testPrisma.inventoryMovement.count({ where: { productId: calendarId } });
const orderOf = (id: string) => testPrisma.order.findUniqueOrThrow({ where: { id }, include: { payments: true } });

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  session.userId = f.store.userId;
  const calendar = await testPrisma.product.create({
    data: {
      name: "Calendario de adviento prueba",
      slug: `calendario-prueba-${randomUUID().slice(0, 8)}`,
      description: "d",
      stock: 0,
      price: UNIT_PRICE,
      acqPrice: 9000,
      sku: `CAL-PRE-${randomUUID().slice(0, 8)}`,
      storeId: f.store.id,
      categoryId: f.category.id,
      colorId: f.component.colorId,
      sizeId: f.component.sizeId,
      designId: f.component.designId,
    },
  });
  calendarId = calendar.id;
  presaleId = (
    await testPrisma.productPresale.create({
      data: {
        storeId: f.store.id,
        productId: calendarId,
        status: ProductPresaleStatus.ACTIVE,
        unitLimit: null,
        expectedArrivalAt: null,
        paymentMode: PresalePaymentMode.DEPOSIT,
        depositType: PresaleDepositType.FIXED,
        depositValue: UNIT_DEPOSIT,
        createdBy: "test",
      },
    })
  ).id;
});

beforeEach(async () => {
  emails.order.mockClear();
  analytics.deposit.mockClear();
  analytics.purchase.mockClear();
  await testPrisma.productPresale.update({ where: { id: presaleId }, data: { committedUnits: 0, status: ProductPresaleStatus.ACTIVE, releasedAt: null } });
  await testPrisma.product.update({ where: { id: calendarId }, data: { stock: 0 } });
});

afterAll(async () => {
  const orders = await testPrisma.order.findMany({ where: { storeId: f.store.id }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await testPrisma.inventoryMovement.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.orderInventoryIssue.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderNotification.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderPayment.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.paymentWebhookEvent.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.shipping.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.order.deleteMany({ where: { id: { in: ids } } });
  await testPrisma.preorderWaitlistEntry.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.productPresale.deleteMany({ where: { id: presaleId } });
  await testPrisma.product.deleteMany({ where: { id: calendarId } });
  await deleteInventoryFixture(f);
});

describe("preventa con anticipo", () => {
  it("el anticipo por Bold con su referencia deja «Anticipo recibido»: sin paidAt, sin inventario, con cupo y el cobro aprobado; repetido no hace nada", async () => {
    const order = await depositOrder(2);
    const first = await boldWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT * 2);
    expect(first.status).toBe(200);

    const after = await orderOf(order.id);
    expect(after.status).toBe(OrderStatus.DEPOSIT_PAID);
    expect(after.paidAt).toBeNull();
    expect(after.depositPaidAt).not.toBeNull();
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]).toMatchObject({ kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED, amount: UNIT_DEPOSIT * 2, transactionId: `TX-${order.orderNumber}-A` });
    expect((await presaleRow()).committedUnits).toBe(2);
    expect(await calendarMoves()).toBe(0);
    expect(emails.order).toHaveBeenCalledWith(order.id, OrderStatus.DEPOSIT_PAID);
    expect(analytics.purchase).not.toHaveBeenCalled();

    const again = await boldWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT * 2);
    expect(again.status).toBe(200);
    expect((await presaleRow()).committedUnits).toBe(2);
    expect((await orderOf(order.id)).payments).toHaveLength(1);
  });

  it("un monto distinto al anticipo se rechaza y el pedido sigue pendiente", async () => {
    const order = await depositOrder(1);
    const response = await boldWebhook(`${order.orderNumber}-A`, UNIT_PRICE);
    expect(response.status).toBe(400);
    expect((await orderOf(order.id)).status).toBe(OrderStatus.PENDING);
    expect((await presaleRow()).committedUnits).toBe(0);
  });

  it("un pago con la referencia del pedido (no la del anticipo) nunca lo da por pagado completo", async () => {
    const order = await depositOrder(1);
    const response = await boldWebhook(order.orderNumber, UNIT_PRICE);
    expect(response.status).toBe(400);
    const after = await orderOf(order.id);
    expect(after.status).toBe(OrderStatus.PENDING);
    expect(after.paidAt).toBeNull();
    expect(await calendarMoves()).toBe(0);
  });

  it("«Marcar anticipo recibido» desde la lista de espera crea el pedido con anticipo y no avisa por defecto", async () => {
    const entry = await testPrisma.preorderWaitlistEntry.create({
      data: { storeId: f.store.id, productId: calendarId, presaleId, name: "Clienta Lista", phone: "+573001112233", channel: PreorderWaitlistChannel.WHATSAPP, createdBy: "test" },
    });
    const { POST } = await import("@/app/api/[storeId]/presales/[presaleId]/deposits/route");
    const response = await POST(
      json("POST", { source: { kind: "waitlist", entryId: entry.id, quantity: 1 }, amount: UNIT_DEPOSIT, method: PaymentMethod.BankTransfer, paidAt: new Date().toISOString() }),
      { params: { storeId: f.store.id, presaleId } },
    );
    await flushBackground();
    expect(response.status).toBe(200);
    const { orderId } = await response.json();

    const order = await orderOf(orderId);
    expect(order).toMatchObject({ status: OrderStatus.DEPOSIT_PAID, paymentPlan: OrderPaymentPlan.DEPOSIT, depositAmount: UNIT_DEPOSIT, total: UNIT_PRICE, source: OrderSource.PANEL, paidAt: null });
    expect(order.payments[0]).toMatchObject({ kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED, method: PaymentMethod.BankTransfer });
    expect((await testPrisma.preorderWaitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe(PreorderWaitlistStatus.CONVERTED);
    expect(emails.order).not.toHaveBeenCalled();
    const skipped = await testPrisma.orderNotification.findMany({ where: { orderId } });
    expect(skipped).toEqual([expect.objectContaining({ status: OrderNotificationStatus.SKIPPED, channel: NotificationChannel.EMAIL, reason: "Anticipo registrado sin avisar" })]);
    expect((await presaleRow()).committedUnits).toBe(1);
    expect(await calendarMoves()).toBe(0);
  });

  it("el cambio de estado genérico no salta el saldo; cancelar devuelve el cupo", async () => {
    const order = await depositOrder(1);
    await boldWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT);
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");

    const toPaid = await PATCH(json("PATCH", { status: OrderStatus.PAID }), { params: { storeId: f.store.id, orderId: order.id } });
    await flushBackground();
    expect(toPaid.status).toBe(400);
    expect((await orderOf(order.id)).status).toBe(OrderStatus.DEPOSIT_PAID);

    // Con anticipo, cancelar pide anotar qué pasa con la plata (push B).
    const bare = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED }), { params: { storeId: f.store.id, orderId: order.id } });
    expect(bare.status).toBe(400);
    const cancel = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, settlement: { retained: UNIT_DEPOSIT } }), { params: { storeId: f.store.id, orderId: order.id } });
    await flushBackground();
    expect(cancel.status).toBe(200);
    expect((await orderOf(order.id)).status).toBe(OrderStatus.CANCELLED);
    expect((await presaleRow()).committedUnits).toBe(0);
    expect(await calendarMoves()).toBe(0);
  });

  it("el saldo espera la liberación; liberada, «Marcar saldo recibido» deja el pedido pagado con el envío y sin mover más inventario", async () => {
    const order = await depositOrder(1);
    await boldWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT);
    const { POST: balance } = await import("@/app/api/[storeId]/orders/[orderId]/balance/route");
    const body = { amount: UNIT_PRICE - UNIT_DEPOSIT + 9000, shippingCost: 9000, method: PaymentMethod.BankTransfer, paidAt: new Date().toISOString() };

    const held = await balance(json("POST", body), { params: { storeId: f.store.id, orderId: order.id } });
    expect(held.status).toBe(409);

    // Llega la mercancía y se libera: el anticipo cuenta como venta por liberar
    // (también los de las pruebas anteriores que siguen con anticipo).
    const pendingUnits = (
      await testPrisma.orderItem.aggregate({
        where: { presaleId, preorderReleasedAt: null, order: { status: { in: [OrderStatus.PAID, OrderStatus.DEPOSIT_PAID] } } },
        _sum: { quantity: true },
      })
    )._sum.quantity ?? 0;
    expect(pendingUnits).toBeGreaterThanOrEqual(1);
    const movesBefore = await calendarMoves();
    await testPrisma.product.update({ where: { id: calendarId }, data: { stock: 20 } });
    const { POST: release } = await import("@/app/api/[storeId]/presales/[presaleId]/release/route");
    const released = await release(json("POST"), { params: { storeId: f.store.id, presaleId } });
    await flushBackground();
    expect(released.status).toBe(200);
    const movesAfterRelease = await calendarMoves();
    expect(movesAfterRelease).toBeGreaterThan(movesBefore);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: calendarId } })).stock).toBe(20 - pendingUnits);
    expect((await testPrisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).preorderReleasedAt).not.toBeNull();

    const wrong = await balance(json("POST", { ...body, amount: UNIT_PRICE - UNIT_DEPOSIT }), { params: { storeId: f.store.id, orderId: order.id } });
    expect(wrong.status).toBe(400);

    const paid = await balance(json("POST", body), { params: { storeId: f.store.id, orderId: order.id } });
    await flushBackground();
    expect(paid.status).toBe(200);
    const after = await orderOf(order.id);
    expect(after.status).toBe(OrderStatus.PAID);
    expect(after.paidAt).not.toBeNull();
    expect(after.total).toBe(UNIT_PRICE + 9000);
    expect(after.payments.map((payment) => payment.kind).sort()).toEqual([OrderPaymentKind.BALANCE, OrderPaymentKind.DEPOSIT]);
    expect(await calendarMoves()).toBe(movesAfterRelease);
    expect(analytics.purchase).toHaveBeenCalledWith(order.id);
    expect(emails.order).not.toHaveBeenCalledWith(order.id, OrderStatus.PAID);
  });

  it("POST /orders no crea un pedido de precio completo con un producto en preventa con anticipo", async () => {
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const response = await POST(
      json("POST", {
        fullName: "Clienta Panel",
        phone: "+573001112233",
        status: OrderStatus.PENDING,
        orderItems: [{ productId: calendarId, quantity: 1 }],
        payment: { method: PaymentMethod.BankTransfer },
      }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Marcar anticipo recibido");
  });

  it("la conciliación nunca toma un pedido con anticipo recibido", async () => {
    const order = await depositOrder(1);
    await boldWebhook(`${order.orderNumber}-A`, UNIT_DEPOSIT);
    await testPrisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } });
    const { selectReconciliationCandidates } = await import("@/lib/payment-reconciliation");
    const candidates = await selectReconciliationCandidates(new Date());
    expect(candidates.map((candidate) => candidate.id)).not.toContain(order.id);
  });
});
