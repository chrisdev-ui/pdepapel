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
 * Abonos libres contra MySQL real: lo que ya pagó la clienta manda en el
 * saldo (el pedido …393 pagó $60.000 de anticipo sobre $30.000 esperados),
 * los abonos se anotan mientras la preventa espera, nunca se pasa del total
 * y, pagado todo antes de que llegue, el saldo al liberar es solo el envío.
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
  const orderNumber = `ORD-ABO-${randomUUID().slice(0, 8)}`;
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
      name: "Calendario de abonos prueba",
      slug: `calendario-abonos-${randomUUID().slice(0, 8)}`,
      description: "d",
      stock: 0,
      price: UNIT_PRICE,
      acqPrice: 9000,
      sku: `CAL-ABO-${randomUUID().slice(0, 8)}`,
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


async function manualDeposit(orderId: string, amount: number) {
  const { POST } = await import("@/app/api/[storeId]/presales/[presaleId]/deposits/route");
  const response = await POST(
    json("POST", { amount, method: PaymentMethod.BankTransfer, paidAt: new Date().toISOString(), source: { kind: "order", orderId } }),
    { params: { storeId: f.store.id, presaleId } },
  );
  await flushBackground();
  return response;
}

async function releasePresale() {
  await testPrisma.product.update({ where: { id: calendarId }, data: { stock: 20 } });
  const { POST } = await import("@/app/api/[storeId]/presales/[presaleId]/release/route");
  const response = await POST(json("POST"), { params: { storeId: f.store.id, presaleId } });
  await flushBackground();
  return response;
}

async function balance(orderId: string, amount: number, shippingCost: number) {
  const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/balance/route");
  const response = await POST(
    json("POST", { amount, shippingCost, method: PaymentMethod.BankTransfer, paidAt: new Date().toISOString() }),
    { params: { storeId: f.store.id, orderId } },
  );
  await flushBackground();
  return response;
}

describe("abonos libres", () => {
  it("…393: con el doble del anticipo pagado, el saldo es total − lo pagado + envío (no total − anticipo)", async () => {
    const order = await depositOrder(1, PaymentMethod.BankTransfer);
    expect((await manualDeposit(order.id, UNIT_DEPOSIT * 2)).status).toBe(200);
    expect((await orderOf(order.id)).status).toBe(OrderStatus.DEPOSIT_PAID);
    expect((await releasePresale()).status).toBe(200);

    const asTheOldDialogSent = await balance(order.id, UNIT_PRICE - UNIT_DEPOSIT + 9000, 9000);
    expect(asTheOldDialogSent.status).toBe(400);
    expect((await asTheOldDialogSent.json()).error).toContain((UNIT_PRICE - UNIT_DEPOSIT * 2 + 9000).toLocaleString("es-CO"));

    const paid = await balance(order.id, UNIT_PRICE - UNIT_DEPOSIT * 2 + 9000, 9000);
    expect(paid.status).toBe(200);
    const after = await orderOf(order.id);
    expect(after.status).toBe(OrderStatus.PAID);
    expect(after.payments.filter((payment) => payment.status === OrderPaymentStatus.APPROVED).reduce((sum, payment) => sum + payment.amount, 0)).toBe(UNIT_PRICE + 9000);
  });
});
