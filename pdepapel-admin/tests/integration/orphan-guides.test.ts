import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { countOrphanGuides, listOrphanGuides } from "@/lib/orphan-guides";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Guías hechas directo en envioclick.com (ventas por WhatsApp): sus avisos
 * llegan sin pedido. 7 entre 2026-09-10 y 2026-10-26; una era la de una
 * clienta que nunca recibió su correo. Vincular, crear el pedido desde la
 * guía o descartar.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const notify = vi.hoisted(() => ({ queue: vi.fn() }));
const envioclick = vi.hoisted(() => ({ createShipment: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/shipment-notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shipment-notifications")>()),
  queueShipmentMilestone: notify.queue,
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/envioclick")>()), envioClickClient: { createShipment: envioclick.createShipment, quoteShipment: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));
vi.mock("@/lib/resource-lock", () => ({ withResourceLock: (_k: string, _m: string, run: () => Promise<unknown>) => run(), ResourceBusyError: class extends Error {} }));

const post = (body: unknown) => new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let f: InventoryFixture;
let ownerId = "";

beforeAll(async () => {
  f = await createInventoryFixture();
  ownerId = f.store.userId;
});
afterEach(() => {
  session.userId = null;
  vi.clearAllMocks();
});
afterAll(async () => {
  await deleteInventoryFixture(f);
});

/** Aviso huérfano con la forma real de EnvioClick (events[0] es el más reciente). */
async function orphan(idOrder: string, events: Array<[string, string]>, createdAt = new Date()) {
  await testPrisma.shippingWebhookEvent.create({
    data: {
      storeId: f.store.id,
      idOrder,
      reason: "shipping_not_found",
      createdAt,
      payload: { idOrder: Number(idOrder), carrier: "envia", trackingCode: `0141${idOrder}`, events: events.map(([statusStep, timestamp]) => ({ statusStep, status: statusStep, timestamp })) },
    },
  });
}

async function paidOrder(opts: { shipping?: "none" | "manual" | "guide"; status?: OrderStatus } = {}) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status: opts.status ?? OrderStatus.PAID,
      paidAt: new Date(),
      type: OrderType.STANDARD,
      source: OrderSource.PANEL,
      fullName: "Clienta Guía",
      phone: "+573001234567",
      email: "clienta@prueba.test",
      address: "Calle 1 # 2-3",
      subtotal: 10000,
      total: 10000,
      orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.BankTransfer } },
      ...(opts.shipping === "none"
        ? {}
        : {
            shipping: {
              create: {
                storeId: f.store.id,
                provider: opts.shipping === "guide" ? ShippingProvider.ENVIOCLICK : ShippingProvider.MANUAL,
                status: ShippingStatus.Preparing,
                ...(opts.shipping === "guide" ? { envioClickIdOrder: 999000 + Math.floor(Math.random() * 1000), trackingCode: "YA-TIENE" } : {}),
              },
            },
          }),
    },
  });
}

const act = async (idOrder: string, body: unknown) => {
  const { POST } = await import("@/app/api/[storeId]/shipments/orphan-guides/[idOrder]/route");
  return POST(post(body), { params: { storeId: f.store.id, idOrder } });
};

describe("guías de EnvioClick sin pedido", () => {
  it("la lista agrupa por guía, toma el estado real y Inicio las cuenta", async () => {
    await orphan("71001", [["Pendiente de recolección", "2026-10-21 12:04:01"]], new Date("2026-10-21T20:31:00Z"));
    await orphan("71001", [["En tránsito", "2026-10-22 09:00:00"], ["Pendiente de recolección", "2026-10-21 12:04:01"]], new Date("2026-10-22T14:00:00Z"));
    const guide = (await listOrphanGuides(testPrisma, f.store.id)).find((g) => g.idOrder === "71001");
    expect(guide).toMatchObject({ carrier: "ENVIA", trackingCode: "014171001", status: ShippingStatus.InTransit, notices: 2 });
    expect(await countOrphanGuides(testPrisma, f.store.id)).toBeGreaterThanOrEqual(1);
  });

  it("solo la dueña vincula o descarta", async () => {
    await orphan("71002", [["Pendiente de recolección", "2026-10-21 12:04:01"]]);
    expect((await act("71002", { action: "dismiss" })).status).toBe(401);
    session.userId = "otra-persona";
    expect([401, 403]).toContain((await act("71002", { action: "dismiss" })).status);
  });

  it("vincular: la guía queda en el envío, el pedido pasa a «Enviado» si ya va en camino, un solo aviso y los avisos se cierran", async () => {
    session.userId = ownerId;
    await orphan("71003", [["En tránsito", "2026-10-22 09:00:00"], ["Pendiente de recolección", "2026-10-21 12:04:01"]]);
    const order = await paidOrder({ shipping: "manual" });

    const response = await act("71003", { action: "link", orderNumber: order.orderNumber });
    expect(response.status).toBe(200);

    const saved = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true, shipping: { select: { provider: true, envioClickIdOrder: true, trackingCode: true, carrierName: true, status: true, trackingEvents: { select: { status: true } } } } } });
    expect(saved.status).toBe(OrderStatus.SENT);
    expect(saved.shipping).toMatchObject({ provider: "ENVIOCLICK", envioClickIdOrder: 71003, trackingCode: "014171003", carrierName: "ENVIA", status: ShippingStatus.InTransit });
    expect(saved.shipping?.trackingEvents).toHaveLength(2);
    expect(notify.queue).toHaveBeenCalledTimes(1);
    expect(notify.queue).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.id, milestone: "en_camino" }));
    const events = await testPrisma.shippingWebhookEvent.findMany({ where: { storeId: f.store.id, idOrder: "71003" } });
    expect(events.every((e) => e.resolution === "LINKED" && e.linkedOrderId === order.id && e.resolvedBy === ownerId)).toBe(true);
    expect((await listOrphanGuides(testPrisma, f.store.id)).some((g) => g.idOrder === "71003")).toBe(false);
  });

  it("un pedido sin envío recibe uno de EnvioClick con la guía", async () => {
    session.userId = ownerId;
    await orphan("71004", [["Pendiente de recolección", "2026-10-26 00:00:00"]]);
    const order = await paidOrder({ shipping: "none" });
    expect((await act("71004", { action: "link", orderNumber: order.orderNumber })).status).toBe(200);
    const shipping = await testPrisma.shipping.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(shipping).toMatchObject({ provider: "ENVIOCLICK", envioClickIdOrder: 71004, status: ShippingStatus.Preparing });
    expect(notify.queue).toHaveBeenCalledWith(expect.objectContaining({ milestone: "guia_creada" }));
  });

  it("no vincula a un pedido con guía, cancelado o que no existe, ni una guía ya usada", async () => {
    session.userId = ownerId;
    await orphan("71005", [["Pendiente de recolección", "2026-10-21 12:04:01"]]);
    const withGuide = await paidOrder({ shipping: "guide" });
    expect((await act("71005", { action: "link", orderNumber: withGuide.orderNumber })).status).toBe(409);
    const cancelled = await paidOrder({ status: OrderStatus.CANCELLED });
    expect((await act("71005", { action: "link", orderNumber: cancelled.orderNumber })).status).toBe(409);
    expect((await act("71005", { action: "link", orderNumber: "ORD-NO-EXISTE" })).status).toBe(404);
    expect((await act("71005", { action: "link", orderNumber: "" })).status).toBe(400);
    expect(notify.queue).not.toHaveBeenCalled();
    expect((await listOrphanGuides(testPrisma, f.store.id)).some((g) => g.idOrder === "71005")).toBe(true);
  });

  it("descartar la saca de la lista y un aviso nuevo de esa guía llega ya cerrado", async () => {
    session.userId = ownerId;
    await orphan("71006", [["Pendiente de recolección", "2026-10-21 12:04:01"]]);
    expect((await act("71006", { action: "dismiss" })).status).toBe(200);
    expect((await listOrphanGuides(testPrisma, f.store.id)).some((g) => g.idOrder === "71006")).toBe(false);

    process.env.ENVIOCLICK_WEBHOOK_SECRET ||= "secreto-de-pruebas-envioclick-1234";
    const { POST } = await import("@/app/api/webhook/envioclick/route");
    const token = process.env.ENVIOCLICK_WEBHOOK_SECRET;
    await POST(new Request(`http://admin.test/api/webhook/envioclick?token=${token}&store=${f.store.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idOrder: 71006, events: [{ statusStep: "En tránsito", timestamp: "2026-10-23 10:00:00" }] }) }));
    const rows = await testPrisma.shippingWebhookEvent.findMany({ where: { storeId: f.store.id, idOrder: "71006" } });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.resolvedAt !== null)).toBe(true);
    expect((await listOrphanGuides(testPrisma, f.store.id)).some((g) => g.idOrder === "71006")).toBe(false);
  });

  it("un aviso de una guía hecha fuera del panel (sin referencia) no se pega a ningún pedido: queda como guía sin pedido", async () => {
    const order = await paidOrder({ shipping: "manual" });
    const shipping = await testPrisma.shipping.findFirstOrThrow({ where: { orderId: order.id } });
    process.env.ENVIOCLICK_WEBHOOK_SECRET ||= "secreto-de-pruebas-envioclick-1234";
    const { POST } = await import("@/app/api/webhook/envioclick/route");
    const token = process.env.ENVIOCLICK_WEBHOOK_SECRET;
    for (const extra of [{}, { myShipmentReference: null }, { myShipmentReference: "" }]) {
      const response = await POST(new Request(`http://admin.test/api/webhook/envioclick?token=${token}&store=${f.store.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idOrder: 71008, trackingCode: "0340AJENA001", events: [{ statusStep: "Entregado", timestamp: "2026-10-23 10:00:00" }], ...extra }) }));
      expect(response.status).toBe(200);
    }
    expect(await testPrisma.shippingTrackingEvent.count({ where: { shippingId: shipping.id } })).toBe(0);
    const after = await testPrisma.shipping.findUniqueOrThrow({ where: { id: shipping.id }, select: { status: true, trackingCode: true } });
    expect(after).toEqual({ status: shipping.status, trackingCode: shipping.trackingCode });
    expect(await testPrisma.shippingWebhookEvent.count({ where: { storeId: f.store.id, idOrder: "71008", reason: "shipping_not_found" } })).toBe(3);
  });

  it("«Crear pedido desde esta guía»: el pedido nuevo queda con la guía y no se crea otra en EnvioClick", async () => {
    session.userId = ownerId;
    await orphan("71007", [["Pendiente de recolección", "2026-10-26 00:00:00"]]);
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const response = await POST(
      new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify({
        fullName: "Clienta WhatsApp", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Tuluá", department: "Valle del Cauca", daneCode: "76834000",
        type: OrderType.STANDARD, status: OrderStatus.PAID,
        orderItems: [{ productId: f.component.id, quantity: 1 }],
        payment: { method: PaymentMethod.BankTransfer },
        shipping: { provider: "ENVIOCLICK", envioClickIdRate: 123, carrierName: "ENVIA", cost: 9000 },
        subtotal: 10000, total: 19000,
        orphanGuideId: "71007",
      }) }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { id: string; guideLink: { linked: boolean } };
    expect(data.guideLink).toEqual({ linked: true, error: null });
    expect(envioclick.createShipment).not.toHaveBeenCalled();
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: data.id }, select: { envioClickIdOrder: true } })).resolves.toEqual({ envioClickIdOrder: 71007 });
    expect((await listOrphanGuides(testPrisma, f.store.id)).some((g) => g.idOrder === "71007")).toBe(false);
  });
});
