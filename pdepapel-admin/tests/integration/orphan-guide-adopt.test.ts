import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { listOrphanGuides } from "@/lib/orphan-guides";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Guías hechas en envioclick.com que se adoptan solas por número de guía: al
 * guardar el número a mano en el pedido y, al revés, cuando el aviso llega por
 * webhook y el número ya estaba en un pedido. También «Vincular» con el mismo
 * número, sin avisar, y los pedidos sugeridos. La clienta recibe solo el hito
 * que no tenga: nunca dos «guía creada».
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const resendSend = vi.hoisted(() => vi.fn());
const whatsapp = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: Record<string, unknown> }>();
  return { env: new Proxy(actual.env, { get: (target, key) => (key === "NODE_ENV" ? "production" : Reflect.get(target, key)) }) };
});
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: resendSend } } }));
vi.mock("@/lib/whatsapp/send", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWhatsAppTemplateMessage: whatsapp }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/envioclick")>()), envioClickClient: { createShipment: vi.fn(), quoteShipment: vi.fn() } }));
vi.mock("@/lib/resource-lock", () => ({ withResourceLock: (_k: string, _m: string, run: () => Promise<unknown>) => run(), ResourceBusyError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));

const CUSTOMER = { fullName: "Clienta Adoptada", phone: "+573001234567", email: "clienta-adopta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000" };
const json = (method: string, body?: unknown, url = "http://admin.test/api/x") =>
  new Request(url, { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: body === undefined ? undefined : JSON.stringify(body) });

let f: InventoryFixture;
let seq = 0;
const guideId = () => String(8_100_000 + seq++ * 7 + Math.floor(Math.random() * 5));
const trackingFor = () => `0340${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

async function flushBackground() {
  while (background.pending.length > 0) await Promise.all(background.pending.splice(0));
}

/** Correos que le llegaron a la clienta y cuántos WhatsApp salieron por lo que hizo `run`. */
async function customerNotices(run: () => Promise<Response | void>) {
  resendSend.mockClear();
  whatsapp.mockClear();
  await run();
  await flushBackground();
  const emails = resendSend.mock.calls.map(([p]) => p as { to: string[]; subject: string }).filter((p) => p.to.includes(CUSTOMER.email)).map((p) => p.subject);
  return { emails, whatsapp: whatsapp.mock.calls.length };
}

async function orphan(idOrder: string, trackingCode: string, steps: Array<[string, string]>) {
  await testPrisma.shippingWebhookEvent.create({
    data: {
      storeId: f.store.id,
      idOrder,
      reason: "shipping_not_found",
      payload: { idOrder: Number(idOrder), carrier: "envia", trackingCode, events: steps.map(([statusStep, timestamp]) => ({ statusStep, status: statusStep, timestamp, receivedBy: "No se usa" })) },
    },
  });
}

async function order(opts: { trackingCode?: string | null; shippingStatus?: ShippingStatus; status?: OrderStatus; createdAt?: Date; phone?: string } = {}) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status: opts.status ?? OrderStatus.PAID,
      paidAt: new Date(),
      type: OrderType.STANDARD,
      source: OrderSource.PANEL,
      ...CUSTOMER,
      ...(opts.phone ? { phone: opts.phone } : {}),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      subtotal: 10000,
      total: 19000,
      orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.BankTransfer } },
      shipping: {
        create: {
          storeId: f.store.id,
          provider: ShippingProvider.MANUAL,
          status: opts.shippingStatus ?? ShippingStatus.Preparing,
          carrierName: "ENVIA",
          trackingCode: opts.trackingCode ?? null,
        },
      },
    },
    include: { shipping: true },
  });
}

async function patchOrder(orderId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
  const response = await PATCH(json("PATCH", body), { params: { storeId: f.store.id, orderId } });
  expect(response.status).toBe(200);
  return response;
}

async function webhook(body: object) {
  process.env.ENVIOCLICK_WEBHOOK_SECRET ||= "secreto-de-pruebas-envioclick-1234";
  const { POST } = await import("@/app/api/webhook/envioclick/route");
  const token = process.env.ENVIOCLICK_WEBHOOK_SECRET;
  const response = await POST(json("POST", body, `http://admin.test/api/webhook/envioclick?token=${token}&store=${f.store.id}`));
  expect(response.status).toBe(200);
  return response;
}

async function vincular(idOrder: string, body: object) {
  const { POST } = await import("@/app/api/[storeId]/shipments/orphan-guides/[idOrder]/route");
  return POST(json("POST", body), { params: { storeId: f.store.id, idOrder } });
}

const customerRows = (orderId: string, milestone: string) =>
  testPrisma.orderNotification.findMany({ where: { orderId, milestone, role: "customer" }, select: { channel: true, status: true, reason: true } });

const DELIVERED: Array<[string, string]> = [["Entregado", "2026-10-27 19:01:00"], ["En tránsito", "2026-10-26 09:00:00"]];

beforeAll(async () => {
  f = await createInventoryFixture();
  await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 50 } });
});
beforeEach(() => {
  session.userId = f.store.userId;
  resendSend.mockResolvedValue({ data: { id: "re_prueba" }, error: null });
  whatsapp.mockResolvedValue({ ok: true, externalId: "wamid.prueba" });
});
afterAll(async () => {
  await testPrisma.shippingWebhookEvent.deleteMany({ where: { storeId: f.store.id } });
  await deleteInventoryFixture(f);
});

describe("al guardar el número de guía a mano", () => {
  it("adopta la guía de EnvioClick con ese número: entregado, pedido Enviado, una sola «guía creada» y un «entregado»", async () => {
    const tracking = trackingFor();
    const id = guideId();
    await orphan(id, tracking, DELIVERED);
    const o = await order();
    // Paula lo escribe con espacios: EnvioClick lo manda corrido.
    const typed = `${tracking.slice(0, 4)} ${tracking.slice(4, 8)} ${tracking.slice(8)}`;
    const notices = await customerNotices(() => patchOrder(o.id, { shippingProvider: ShippingProvider.MANUAL, shipping: { carrierName: "ENVIA", trackingCode: typed } }));

    const saved = await testPrisma.order.findUniqueOrThrow({ where: { id: o.id }, select: { status: true, shipping: { select: { provider: true, envioClickIdOrder: true, trackingCode: true, status: true, trackingEvents: { select: { status: true } } } } } });
    expect(saved.status).toBe(OrderStatus.SENT);
    expect(saved.shipping).toMatchObject({ provider: "ENVIOCLICK", envioClickIdOrder: Number(id), trackingCode: typed, status: ShippingStatus.Delivered });
    expect(saved.shipping?.trackingEvents).toHaveLength(2);
    const rows = await testPrisma.shippingWebhookEvent.findMany({ where: { storeId: f.store.id, idOrder: id } });
    expect(rows.every((r) => r.resolution === "LINKED" && r.linkedOrderId === o.id && r.resolvedBy === f.store.userId)).toBe(true);

    expect(notices.emails).toHaveLength(2);
    await expect(customerRows(o.id, "guia_creada")).resolves.toEqual([expect.objectContaining({ channel: "EMAIL", status: "SENT" })]);
    await expect(customerRows(o.id, "entregado")).resolves.toEqual([expect.objectContaining({ channel: "EMAIL", status: "SENT" })]);
    // Sin el correo de «pedido enviado»: lo movió la guía, como el webhook.
    expect(notices.emails.some((subject) => /enviado/i.test(subject) && !/entreg/i.test(subject))).toBe(false);
  });

  it("sin avisar: adopta igual y a la clienta no le sale nada (filas «Omitido»)", async () => {
    const tracking = trackingFor();
    const id = guideId();
    await orphan(id, tracking, DELIVERED);
    const o = await order();
    const notices = await customerNotices(() => patchOrder(o.id, { shippingProvider: ShippingProvider.MANUAL, shipping: { carrierName: "ENVIA", trackingCode: tracking }, notifyCustomer: false }));
    expect(notices).toEqual({ emails: [], whatsapp: 0 });
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: o.id } })).resolves.toMatchObject({ envioClickIdOrder: Number(id), status: ShippingStatus.Delivered });
    const delivered = await customerRows(o.id, "entregado");
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.every((row) => row.status === "SKIPPED" && row.reason === "Cambio de estado sin avisar")).toBe(true);
  });

  it("sin guía con ese número, o con dos guías del mismo número, no adopta nada", async () => {
    const o = await order();
    await patchOrder(o.id, { shippingProvider: ShippingProvider.MANUAL, shipping: { carrierName: "ENVIA", trackingCode: trackingFor() } });
    await flushBackground();
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: o.id } })).resolves.toMatchObject({ provider: "MANUAL", envioClickIdOrder: null });

    const tracking = trackingFor();
    const a = guideId();
    const b = guideId();
    await orphan(a, tracking, DELIVERED);
    await orphan(b, tracking, DELIVERED);
    const twice = await order();
    await patchOrder(twice.id, { shippingProvider: ShippingProvider.MANUAL, shipping: { carrierName: "ENVIA", trackingCode: tracking } });
    await flushBackground();
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: twice.id } })).resolves.toMatchObject({ provider: "MANUAL", envioClickIdOrder: null });
    const open = (await listOrphanGuides(testPrisma, f.store.id)).map((g) => g.idOrder);
    expect(open).toEqual(expect.arrayContaining([a, b]));
  });

  it("solo hacia adelante: un envío ya «Enviado» no vuelve atrás con una guía que solo dice «Pendiente de recolección»", async () => {
    const tracking = trackingFor();
    const id = guideId();
    await orphan(id, tracking, [["Pendiente de recolección", "2026-10-27 08:00:00"]]);
    const o = await order({ shippingStatus: ShippingStatus.InTransit, status: OrderStatus.SENT });
    const notices = await customerNotices(() => patchOrder(o.id, { shippingProvider: ShippingProvider.MANUAL, shipping: { carrierName: "ENVIA", trackingCode: tracking } }));
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: o.id } })).resolves.toMatchObject({ envioClickIdOrder: Number(id), status: ShippingStatus.InTransit });
    // Solo la «guía creada» del número nuevo; ningún hito más.
    expect(notices.emails).toHaveLength(1);
  });
});

describe("al revés: el aviso de EnvioClick llega y el número ya estaba en un pedido", () => {
  it("la adopta sola y manda solo el hito que falta (la «guía creada» ya le llegó al escribir el número)", async () => {
    const tracking = trackingFor();
    const o = await order();
    await customerNotices(() => patchOrder(o.id, { shippingProvider: ShippingProvider.MANUAL, shipping: { carrierName: "ENVIA", trackingCode: tracking } }));
    await expect(customerRows(o.id, "guia_creada")).resolves.toHaveLength(1);

    const id = guideId();
    const notices = await customerNotices(() => webhook({ idOrder: Number(id), trackingCode: tracking, carrier: "envia", events: DELIVERED.map(([statusStep, timestamp]) => ({ statusStep, status: statusStep, timestamp })) }));
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: o.id } })).resolves.toMatchObject({ provider: "ENVIOCLICK", envioClickIdOrder: Number(id), status: ShippingStatus.Delivered });
    expect(notices.emails).toHaveLength(1);
    await expect(customerRows(o.id, "guia_creada")).resolves.toHaveLength(1);
    await expect(customerRows(o.id, "entregado")).resolves.toEqual([expect.objectContaining({ status: "SENT" })]);
    const rows = await testPrisma.shippingWebhookEvent.findMany({ where: { idOrder: id } });
    expect(rows.every((r) => r.resolution === "LINKED" && r.resolvedBy === "auto" && r.linkedOrderId === o.id)).toBe(true);

    // El siguiente aviso ya encuentra el envío por su id: nada huérfano y nada repetido.
    const again = await customerNotices(() => webhook({ idOrder: Number(id), trackingCode: tracking, events: [{ statusStep: "Entregado", status: "Entregado", timestamp: "2026-10-27 19:01:00" }] }));
    expect(again.emails).toHaveLength(0);
  });

  it("no adopta con dos pedidos del mismo número, con el pedido cancelado, ni una guía oculta", async () => {
    const shared = trackingFor();
    const a = await order({ trackingCode: shared });
    const b = await order({ trackingCode: shared });
    const id = guideId();
    await webhook({ idOrder: Number(id), trackingCode: shared, events: [{ statusStep: "En tránsito", timestamp: "2026-10-27 10:00:00" }] });
    for (const o of [a, b]) {
      await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: o.id } })).resolves.toMatchObject({ provider: "MANUAL", envioClickIdOrder: null });
    }

    const lone = trackingFor();
    const cancelled = await order({ trackingCode: lone, status: OrderStatus.CANCELLED });
    await webhook({ idOrder: Number(guideId()), trackingCode: lone, events: [{ statusStep: "En tránsito", timestamp: "2026-10-27 10:00:00" }] });
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: cancelled.id } })).resolves.toMatchObject({ envioClickIdOrder: null });

    const hiddenTracking = trackingFor();
    const hidden = guideId();
    const waiting = await order({ trackingCode: hiddenTracking });
    await orphan(hidden, hiddenTracking, [["En tránsito", "2026-10-27 10:00:00"]]);
    expect((await vincular(hidden, { action: "dismiss" })).status).toBe(200);
    await webhook({ idOrder: Number(hidden), trackingCode: hiddenTracking, events: [{ statusStep: "Entregado", timestamp: "2026-10-27 19:00:00" }] });
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: waiting.id } })).resolves.toMatchObject({ envioClickIdOrder: null });
  });
});

describe("«Vincular» a mano", () => {
  it("acepta el pedido con el mismo número escrito a mano y rechaza otro número con un mensaje claro", async () => {
    const tracking = trackingFor();
    const id = guideId();
    await orphan(id, tracking, DELIVERED);
    const other = await order({ trackingCode: trackingFor() });
    const refused = await vincular(id, { action: "link", orderNumber: other.orderNumber });
    expect(refused.status).toBe(409);
    expect(JSON.stringify(await refused.json())).toContain("ya tiene otro número de guía");

    const same = await order({ trackingCode: tracking });
    const notices = await customerNotices(async () => {
      const response = await vincular(id, { action: "link", orderNumber: same.orderNumber });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ orderNumber: same.orderNumber, status: ShippingStatus.Delivered });
    });
    expect(notices.emails).toHaveLength(1);
    await expect(customerRows(same.id, "entregado")).resolves.toEqual([expect.objectContaining({ status: "SENT" })]);
  });

  it("sin avisar: la clienta no recibe nada y el hito queda «Omitido»", async () => {
    const tracking = trackingFor();
    const id = guideId();
    await orphan(id, tracking, DELIVERED);
    const o = await order({ trackingCode: tracking });
    const notices = await customerNotices(async () => {
      expect((await vincular(id, { action: "link", orderNumber: o.orderNumber, notifyCustomer: false })).status).toBe(200);
    });
    expect(notices).toEqual({ emails: [], whatsapp: 0 });
    const rows = await customerRows(o.id, "entregado");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === "SKIPPED" && row.reason === "Cambio de estado sin avisar")).toBe(true);
    expect((await vincular(guideId(), { action: "link", orderNumber: o.orderNumber, notifyCustomer: "no" })).status).toBeGreaterThanOrEqual(400);
  });

  it("sugiere pedidos sin guía de los 14 días antes, el del mismo número primero, sin nombres, y busca por celular", async () => {
    const tracking = trackingFor();
    const id = guideId();
    await orphan(id, tracking, DELIVERED);
    const recent = await order({ createdAt: new Date(Date.now() - 2 * 86_400_000), phone: "+573001112233" });
    const sameNumber = await order({ trackingCode: tracking, createdAt: new Date(Date.now() - 9 * 86_400_000) });
    const otherNumber = await order({ trackingCode: trackingFor(), createdAt: new Date(Date.now() - 1 * 86_400_000) });
    const tooOld = await order({ createdAt: new Date(Date.now() - 20 * 86_400_000) });

    const { GET } = await import("@/app/api/[storeId]/shipments/orphan-guides/[idOrder]/route");
    const list = async (q?: string) => {
      const response = await GET(new Request(`http://admin.test/api/x${q ? `?q=${encodeURIComponent(q)}` : ""}`), { params: { storeId: f.store.id, idOrder: id } });
      expect(response.status).toBe(200);
      return ((await response.json()) as { candidates: Array<Record<string, unknown>> }).candidates;
    };
    const suggested = await list();
    const numbers = suggested.map((c) => c.orderNumber);
    expect(numbers[0]).toBe(sameNumber.orderNumber);
    expect(suggested[0]).toMatchObject({ trackingMatch: true });
    expect(numbers).toContain(recent.orderNumber);
    expect(numbers).not.toContain(otherNumber.orderNumber);
    expect(numbers).not.toContain(tooOld.orderNumber);
    expect(JSON.stringify(suggested)).not.toContain(CUSTOMER.fullName);
    expect(suggested.find((c) => c.orderNumber === recent.orderNumber)).toMatchObject({ phoneLast4: "2233", city: "Medellín", total: 19000 });

    const byPhone = await list("1112233");
    expect(byPhone.map((c) => c.orderNumber)).toEqual([recent.orderNumber]);
    const byName = await list("Adoptada");
    expect(byName.map((c) => c.orderNumber)).toEqual(expect.arrayContaining([recent.orderNumber, tooOld.orderNumber]));

    session.userId = "otra-persona";
    const forbidden = await GET(new Request("http://admin.test/api/x"), { params: { storeId: f.store.id, idOrder: id } });
    expect([401, 403]).toContain(forbidden.status);
  });
});
