import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus, WhatsAppOptInSource } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Cambiar estado sin avisar»: con `notifyCustomer: false` el cambio no le
 * manda correo ni WhatsApp a la clienta (ni el de estado ni el del hito del
 * envío), deja una fila SKIPPED por pedido con quién lo hizo, y la tarjeta
 * de regalo pagada se entrega igual (es lo que compró, no un aviso).
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const resendSend = vi.hoisted(() => vi.fn());
const whatsapp = vi.hoisted(() => vi.fn());
const delivery = vi.hoisted(() => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
// with-test-env.mjs fija NODE_ENV=development y en desarrollo ningún correo se arma.
vi.mock("@/lib/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: Record<string, unknown> }>();
  return { env: new Proxy(actual.env, { get: (target, key) => (key === "NODE_ENV" ? "production" : Reflect.get(target, key)) }) };
});
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: resendSend } } }));
vi.mock("@/lib/whatsapp/send", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWhatsAppTemplateMessage: whatsapp }));
vi.mock("@/lib/gift-card-delivery", () => delivery);
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/envioclick")>()), envioClickClient: { createShipment: vi.fn(), quoteShipment: vi.fn() } }));
vi.mock("@/lib/resource-lock", () => ({ withResourceLock: (_k: string, _m: string, run: () => Promise<unknown>) => run(), ResourceBusyError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));
vi.mock("@upstash/redis", () => {
  const client = { get: async () => null, set: async () => "OK", del: async () => 1, scan: async () => [0, []], incr: async () => 1, expire: async () => 1 };
  class Redis {
    static fromEnv() {
      return client;
    }
    get = client.get;
    set = client.set;
    del = client.del;
    scan = client.scan;
    incr = client.incr;
    expire = client.expire;
  }
  return { Redis };
});

const CUSTOMER = { fullName: "Clienta Silenciosa", phone: "+573001234567", email: "clienta-silencio@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000", neighborhood: "Centro" };
const BUYER = "luisa-silencio@prueba.test";
const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", {
    method,
    headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let f: InventoryFixture;

async function flushBackground() {
  while (background.pending.length > 0) {
    await Promise.all(background.pending.splice(0));
  }
}

/** Lo que le llegó a `to` (correos) y cuántos WhatsApp salieron por lo que hizo `run`. */
async function noticesOf(run: () => Promise<Response>, to = CUSTOMER.email) {
  resendSend.mockClear();
  whatsapp.mockClear();
  const response = await run();
  expect(response.status).toBe(200);
  await flushBackground();
  const emails = resendSend.mock.calls
    .map(([payload]) => payload as { to: string[]; subject: string })
    .filter((payload) => payload.to.includes(to))
    .map((payload) => payload.subject);
  return { emails, whatsapp: whatsapp.mock.calls.length };
}

/** Pedido con transportadora, guía y avisos por WhatsApp aceptados: el caso en que más avisos salen. */
async function order(status: OrderStatus) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status,
      ...(status === OrderStatus.PAID ? { paidAt: new Date() } : {}),
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      ...CUSTOMER,
      subtotal: 10000,
      total: 19000,
      whatsappOptInAt: new Date(),
      whatsappOptInVersion: "2026-10-26",
      whatsappOptInSource: WhatsAppOptInSource.CHECKOUT,
      orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.BankTransfer } },
      shipping: {
        create: {
          storeId: f.store.id,
          provider: ShippingProvider.ENVIOCLICK,
          status: ShippingStatus.Shipped,
          envioClickIdOrder: Math.floor(Math.random() * 1e8),
          trackingCode: `TRK${randomUUID().slice(0, 8)}`,
          carrierName: "ENVIA",
          cost: 9000,
        },
      },
    },
    include: { shipping: true },
  });
}

async function patchOrder(orderId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
  return PATCH(json("PATCH", body), { params: { storeId: f.store.id, orderId } });
}

async function patchList(ids: string[], body: object) {
  const { PATCH } = await import("@/app/api/[storeId]/orders/route");
  return PATCH(json("PATCH", { ids, ...body }), { params: { storeId: f.store.id } });
}

const silentRows = (orderId: string) => testPrisma.orderNotification.findMany({ where: { orderId, milestone: { startsWith: "estado:" } } });
const markPaid = { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" }, skipAutoGuide: true };

beforeAll(async () => {
  f = await createInventoryFixture();
  await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 50 } });
  await testPrisma.storeSettings.upsert({
    where: { storeId: f.store.id },
    create: { storeId: f.store.id, whatsappOrderUpdatesEnabled: true, whatsappTemplateGuide: "guia_creada", whatsappTemplateDelivered: "pedido_entregado" },
    update: { whatsappOrderUpdatesEnabled: true, whatsappTemplateGuide: "guia_creada", whatsappTemplateDelivered: "pedido_entregado" },
  });
});
beforeEach(() => {
  session.userId = f.store.userId;
  resendSend.mockResolvedValue({ data: { id: "re_prueba" }, error: null });
  whatsapp.mockResolvedValue({ ok: true, externalId: "wamid.prueba" });
  delivery.deliverGiftCard.mockClear();
});
afterAll(async () => {
  await testPrisma.giftCardMovement.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.giftCard.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.giftCardDenomination.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: f.store.id } });
  await deleteInventoryFixture(f);
});

describe("cambiar estado sin avisar (página del pedido)", () => {
  it("«Marcar como pagado» sin avisar: ningún correo ni WhatsApp, una fila SKIPPED con quién lo hizo", async () => {
    const o = await order(OrderStatus.PENDING);
    const notices = await noticesOf(() => patchOrder(o.id, { ...markPaid, notifyCustomer: false }));
    expect(notices).toEqual({ emails: [], whatsapp: 0 });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: o.id } })).resolves.toMatchObject({ status: OrderStatus.PAID });
    const rows = await silentRows(o.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      milestone: "estado:PAID",
      channel: "EMAIL",
      role: "customer",
      status: "SKIPPED",
      reason: "Cambio de estado sin avisar",
      createdBy: f.store.userId,
      shippingId: o.shipping!.id,
    });
    expect(rows[0].dedupeKey).toMatch(new RegExp(`^silent:${o.id}:\\d+:[a-z0-9]{6}$`));
  });

  it("sin la bandera sale el correo de pago confirmado como siempre, y no queda fila de silencio", async () => {
    const o = await order(OrderStatus.PENDING);
    const notices = await noticesOf(() => patchOrder(o.id, markPaid));
    expect(notices.emails).toHaveLength(1);
    expect(notices.emails[0]).toContain(o.orderNumber);
    await expect(silentRows(o.id)).resolves.toHaveLength(0);
  });

  it("el envío «Entregado» sin avisar: ni el correo ni el WhatsApp del hito; el pedido pasa a Enviado y su estado manda en la fila", async () => {
    const o = await order(OrderStatus.PAID);
    const body = { shippingProvider: ShippingProvider.ENVIOCLICK, shipping: { status: ShippingStatus.Delivered, carrierName: "ENVIA" } };
    expect(await noticesOf(() => patchOrder(o.id, { ...body, notifyCustomer: false }))).toEqual({ emails: [], whatsapp: 0 });
    const rows = await silentRows(o.id);
    expect(rows.map((row) => row.milestone)).toEqual(["estado:SENT"]);
    // El hito queda reclamado para la clienta como «Omitido»; la copia a Paula sale igual.
    const milestoneRows = await testPrisma.orderNotification.findMany({ where: { orderId: o.id, milestone: "entregado" } });
    const customerRows = milestoneRows.filter((row) => row.role === "customer");
    expect(customerRows.map((row) => row.channel).sort()).toEqual(["EMAIL", "WHATSAPP"]);
    expect(customerRows.every((row) => row.status === "SKIPPED" && row.reason === "Cambio de estado sin avisar")).toBe(true);
    expect(milestoneRows.find((row) => row.role === "admin")?.status).toBe("SENT");

    // Un webhook de la transportadora con el mismo hito, después, no le escribe.
    const { notifyShipmentMilestone } = await import("@/lib/shipment-notifications");
    resendSend.mockClear();
    whatsapp.mockClear();
    const later = await notifyShipmentMilestone({ orderId: o.id, storeId: f.store.id, milestone: "entregado", source: "webhook de prueba" });
    expect(later.email.customer).toBe("duplicate");
    expect(later.whatsapp).toBe("duplicate");
    expect(whatsapp).not.toHaveBeenCalled();
    expect(resendSend.mock.calls.filter(([payload]) => (payload as { to: string[] }).to.includes(CUSTOMER.email))).toHaveLength(0);
  });

  it("una bandera que no es booleana se rechaza sin cambiar nada", async () => {
    const o = await order(OrderStatus.PENDING);
    const response = await patchOrder(o.id, { ...markPaid, notifyCustomer: "no" });
    expect(response.status).toBe(400);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: o.id } })).resolves.toMatchObject({ status: OrderStatus.PENDING });
  });
});

describe("cambiar estado sin avisar (lista de pedidos)", () => {
  it("el lote «Entregado» avisa por correo y WhatsApp sin la bandera (control)", async () => {
    const a = await order(OrderStatus.PAID);
    const notices = await noticesOf(() => patchList([a.id], { shipping: ShippingStatus.Delivered }));
    expect(notices.emails).toEqual([`¡Tu pedido #${a.orderNumber} ha sido entregado!`]);
    expect(notices.whatsapp).toBe(1);
  });

  it("dos pedidos sin avisar: ningún correo ni WhatsApp, dos filas", async () => {
    const a = await order(OrderStatus.PAID);
    const b = await order(OrderStatus.PAID);
    expect(await noticesOf(() => patchList([a.id, b.id], { shipping: ShippingStatus.Delivered, notifyCustomer: false }))).toEqual({ emails: [], whatsapp: 0 });
    const all = await testPrisma.orderNotification.findMany({ where: { orderId: { in: [a.id, b.id] } } });
    const rows = all.filter((row) => row.milestone.startsWith("estado:"));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.milestone === "estado:Delivered" && row.status === "SKIPPED" && row.createdBy === f.store.userId)).toBe(true);
    expect(new Set(rows.map((row) => row.orderId))).toEqual(new Set([a.id, b.id]));
    // El hito «entregado» queda reclamado para cada clienta, sin enviarse; la copia a Paula sale.
    const customer = all.filter((row) => row.milestone === "entregado" && row.role === "customer");
    expect(customer).toHaveLength(4);
    expect(customer.every((row) => row.status === "SKIPPED" && row.reason === "Cambio de estado sin avisar" && row.createdBy === f.store.userId)).toBe(true);
  });

  it("el lote «Cancelado» sin avisar no manda el correo de cancelación", async () => {
    const a = await order(OrderStatus.PAID);
    const b = await order(OrderStatus.PAID);
    expect(await noticesOf(() => patchList([a.id, b.id], { status: OrderStatus.CANCELLED, notifyCustomer: false }))).toEqual({ emails: [], whatsapp: 0 });
    const rows = await testPrisma.orderNotification.findMany({ where: { orderId: { in: [a.id, b.id] } } });
    expect(rows.map((row) => row.milestone)).toEqual(["estado:CANCELLED", "estado:CANCELLED"]);
  });

  it("«Pagada» sin avisar con una tarjeta de regalo: la tarjeta se entrega igual, sin correo de pago", async () => {
    await testPrisma.order.create({
      data: { storeId: f.store.id, orderNumber: `ORD-PREVIA-${randomUUID()}`, fullName: "Luisa Sánchez", email: BUYER, phone: "", address: "", status: OrderStatus.PAID, type: OrderType.CUSTOM, paidAt: new Date(), subtotal: 1000, total: 1000 },
    });
    const { POST } = await import("@/app/api/[storeId]/gift-cards/checkout/route");
    const bought = await POST(
      json("POST", {
        amount: 100000,
        buyerName: "Luisa Sánchez",
        buyerEmail: BUYER,
        recipientName: "Mariana López",
        recipientEmail: "mariana-silencio@prueba.test",
        message: "¡Feliz cumpleaños!",
        payment: { method: PaymentMethod.BankTransfer },
        guestId: `guest-${Date.now()}`,
      }),
      { params: { storeId: f.store.id } },
    );
    expect(bought.status).toBe(200);
    const giftOrder = (await bought.json()) as { id: string };
    await flushBackground();

    const notices = await noticesOf(() => patchList([giftOrder.id], { status: OrderStatus.PAID, notifyCustomer: false }), BUYER);
    expect(notices).toEqual({ emails: [], whatsapp: 0 });
    expect(delivery.deliverGiftCard).toHaveBeenCalledTimes(1);
    expect(delivery.deliverGiftCard.mock.calls[0][0].card.purchaseOrderId).toBe(giftOrder.id);
    await expect(silentRows(giftOrder.id)).resolves.toMatchObject([{ milestone: "estado:PAID", createdBy: f.store.userId }]);
  });
});
