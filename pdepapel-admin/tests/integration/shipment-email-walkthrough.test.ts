import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Regresión del 26 oct: con los avisos de envío, «Marcar como enviado» después
 * de crear la guía le mandaba a la clienta un segundo «Enviado» encima de «ya
 * tiene guía», un solo guardado con «Enviado» + «Entregado» mandaba dos
 * correos, y el lote «Entregado» de la lista no mandaba ninguno. Cada camino
 * real (guía, webhook, página del pedido, lista, recoger en tienda) manda
 * exactamente un correo por hecho.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const resendSend = vi.hoisted(() => vi.fn());
const envioclick = vi.hoisted(() => ({ createShipment: vi.fn() }));

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
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/envioclick")>()), envioClickClient: { createShipment: envioclick.createShipment, quoteShipment: vi.fn() } }));
vi.mock("@/lib/resource-lock", () => ({ withResourceLock: (_k: string, _m: string, run: () => Promise<unknown>) => run(), ResourceBusyError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));

const CUSTOMER = { fullName: "Clienta Recorrido", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000", neighborhood: "Centro" };
const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

let f: InventoryFixture;
let nextGuide = 880000 + Math.floor(Math.random() * 100000);

async function flushBackground() {
  while (background.pending.length > 0) {
    await Promise.all(background.pending.splice(0));
  }
}

/** Los asuntos que le llegaron a la clienta por lo que hizo `run`. */
async function customerSubjects(run: () => Promise<Response>): Promise<string[]> {
  resendSend.mockClear();
  const response = await run();
  expect(response.status).toBe(200);
  await flushBackground();
  return resendSend.mock.calls
    .map(([payload]) => payload as { to: string[]; subject: string })
    .filter((payload) => payload.to.includes(CUSTOMER.email))
    .map((payload) => payload.subject);
}

async function order(provider: ShippingProvider) {
  const carrier = provider === ShippingProvider.ENVIOCLICK;
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      ...CUSTOMER,
      subtotal: 10000,
      total: carrier ? 19000 : 10000,
      orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
      payment: { create: { storeId: f.store.id, method: carrier ? PaymentMethod.Bold : PaymentMethod.BankTransfer } },
      shipping: {
        create: carrier
          ? { storeId: f.store.id, provider, status: ShippingStatus.Preparing, envioClickIdRate: 777001, carrierName: "ENVIA", courier: "ENVIA", productName: "Normal", cost: 9000, flete: 9000, deliveryDays: 3 }
          : { storeId: f.store.id, provider, status: ShippingStatus.Preparing },
      },
    },
  });
}

async function createGuide(orderId: string) {
  const idOrder = (nextGuide += 1);
  envioclick.createShipment.mockResolvedValueOnce({
    data: { idOrder, tracker: `GUIA${idOrder}`, url: `https://guia.test/${idOrder}`, guide: "", requestPickup: true, external_order_id: "x", origin: {}, destination: {} },
  });
  const route = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
  return { idOrder, run: () => route.POST(json("POST"), { params: { storeId: f.store.id, orderId } }) };
}

async function webhook(idOrder: number, statusStep: string, timestamp: string) {
  const { POST } = await import("@/app/api/webhook/envioclick/route");
  return POST(
    new Request(`http://admin.test/api/webhook/envioclick?token=${process.env.ENVIOCLICK_WEBHOOK_SECRET}&store=${f.store.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idOrder, events: [{ statusStep, timestamp }] }),
    }),
  );
}

async function patchOrder(orderId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
  return PATCH(json("PATCH", body), { params: { storeId: f.store.id, orderId } });
}

async function patchList(ids: string[], body: object) {
  const { PATCH } = await import("@/app/api/[storeId]/orders/route");
  return PATCH(json("PATCH", { ids, ...body }), { params: { storeId: f.store.id } });
}

const carrierShipping = (status: ShippingStatus) => ({ shippingProvider: ShippingProvider.ENVIOCLICK, shipping: { status, carrierName: "ENVIA" } });
const guide = (n: string) => `Tu pedido #${n} ya tiene guía de envío`;
const inTransit = (n: string) => `Tu pedido #${n} está en tránsito`;
const outForDelivery = (n: string) => `¡Tu pedido #${n} sale hoy a entrega!`;
const delivered = (n: string) => `¡Tu pedido #${n} ha sido entregado!`;

beforeAll(async () => {
  process.env.ENVIOCLICK_WEBHOOK_SECRET ||= "secreto-de-pruebas-envioclick-1234";
  f = await createInventoryFixture();
});
beforeEach(() => {
  session.userId = f.store.userId;
  resendSend.mockResolvedValue({ data: { id: "re_prueba" }, error: null });
});
afterAll(async () => {
  await deleteInventoryFixture(f);
});

describe("un correo a la clienta por cada hecho del envío", () => {
  it("la transportadora lo mueve (webhook): guía, recogido, en reparto, entregado; lo repetido no sale", async () => {
    const o = await order(ShippingProvider.ENVIOCLICK);
    const n = o.orderNumber;
    const { idOrder, run } = await createGuide(o.id);
    expect(await customerSubjects(run)).toEqual([guide(n)]);
    expect(await customerSubjects(() => webhook(idOrder, "Recolectado", "2026-10-26 10:00:00"))).toEqual([inTransit(n)]);
    expect(await customerSubjects(() => webhook(idOrder, "En tránsito", "2026-10-26 12:00:00"))).toEqual([]);
    expect(await customerSubjects(() => webhook(idOrder, "En reparto", "2026-10-27 08:00:00"))).toEqual([outForDelivery(n)]);
    expect(await customerSubjects(() => webhook(idOrder, "Entregado", "2026-10-27 15:00:00"))).toEqual([delivered(n)]);
    expect(await customerSubjects(() => webhook(idOrder, "Entregado", "2026-10-27 15:05:00"))).toEqual([]);
  });

  it("Paula lo mueve en la página del pedido: «Marcar como enviado» con guía ya no manda un segundo aviso", async () => {
    const o = await order(ShippingProvider.ENVIOCLICK);
    const n = o.orderNumber;
    const { run } = await createGuide(o.id);
    expect(await customerSubjects(run)).toEqual([guide(n)]);
    expect(await customerSubjects(() => patchOrder(o.id, { status: OrderStatus.SENT, expectedStatus: OrderStatus.PAID }))).toEqual([]);
    expect(await customerSubjects(() => patchOrder(o.id, carrierShipping(ShippingStatus.InTransit)))).toEqual([inTransit(n)]);
    expect(await customerSubjects(() => patchOrder(o.id, carrierShipping(ShippingStatus.OutForDelivery)))).toEqual([outForDelivery(n)]);
    expect(await customerSubjects(() => patchOrder(o.id, carrierShipping(ShippingStatus.Delivered)))).toEqual([delivered(n)]);
  });

  it("un solo guardado con «Enviado» y envío «Entregado»: solo «entregado»", async () => {
    const o = await order(ShippingProvider.ENVIOCLICK);
    const { run } = await createGuide(o.id);
    await customerSubjects(run);
    expect(
      await customerSubjects(() => patchOrder(o.id, { status: OrderStatus.SENT, expectedStatus: OrderStatus.PAID, ...carrierShipping(ShippingStatus.Delivered) })),
    ).toEqual([delivered(o.orderNumber)]);
  });

  it("«Enviado» sin guía todavía: el correo de estado sigue saliendo (es el único aviso)", async () => {
    const o = await order(ShippingProvider.ENVIOCLICK);
    expect(await customerSubjects(() => patchOrder(o.id, { status: OrderStatus.SENT, expectedStatus: OrderStatus.PAID, skipAutoGuide: true }))).toEqual([
      `Tu pedido #${o.orderNumber} - Enviado`,
    ]);
  });

  it("la lista de pedidos: «Enviado» con guía no repite, y el lote «Entregado» sí avisa", async () => {
    const o = await order(ShippingProvider.ENVIOCLICK);
    const { run } = await createGuide(o.id);
    await customerSubjects(run);
    expect(await customerSubjects(() => patchList([o.id], { status: OrderStatus.SENT }))).toEqual([]);
    expect(await customerSubjects(() => patchList([o.id], { shipping: ShippingStatus.Delivered }))).toEqual([delivered(o.orderNumber)]);
    await expect(testPrisma.orderNotification.count({ where: { orderId: o.id, milestone: "entregado", channel: "EMAIL", role: "customer" } })).resolves.toBe(1);
  });

  it("recoger en tienda: «Marcar entregado», el envío «Entregado», el guardado doble y el lote mandan un solo «entregado»", async () => {
    const a = await order(ShippingProvider.NONE);
    expect(await customerSubjects(() => patchOrder(a.id, { status: OrderStatus.SENT, expectedStatus: OrderStatus.PAID }))).toEqual([delivered(a.orderNumber)]);

    const b = await order(ShippingProvider.NONE);
    expect(await customerSubjects(() => patchOrder(b.id, { shippingProvider: ShippingProvider.NONE, shipping: { status: ShippingStatus.Delivered } }))).toEqual([
      delivered(b.orderNumber),
    ]);

    const c = await order(ShippingProvider.NONE);
    expect(
      await customerSubjects(() =>
        patchOrder(c.id, { status: OrderStatus.SENT, expectedStatus: OrderStatus.PAID, shippingProvider: ShippingProvider.NONE, shipping: { status: ShippingStatus.Delivered } }),
      ),
    ).toEqual([delivered(c.orderNumber)]);

    const d = await order(ShippingProvider.NONE);
    expect(await customerSubjects(() => patchList([d.id], { status: OrderStatus.SENT }))).toEqual([delivered(d.orderNumber)]);

    // El lote del envío no avisa a una recogida: su «entregado» es el «Enviado» del pedido.
    const e = await order(ShippingProvider.NONE);
    expect(await customerSubjects(() => patchList([e.id], { shipping: ShippingStatus.Delivered }))).toEqual([]);
  });
});
