import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { getOrderNotificationsView } from "@/lib/order-notifications-view";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Avisos a la clienta» del pedido: anotar que la clienta pidió avisos por
 * WhatsApp en el chat (solo pedidos nacidos en WhatsApp, queda quién y
 * cuándo), quitarlos, y reenviar un aviso. Solo la dueña.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const sent = vi.hoisted(() => ({ email: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/email")>()), sendShipmentMilestoneEmail: sent.email }));

const post = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

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
  await testPrisma.conversation.deleteMany({ where: { storeId: f.store.id } });
  await deleteInventoryFixture(f);
});

async function order(source: OrderSource, opts: { tracking?: boolean } = {}) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      type: OrderType.STANDARD,
      source,
      fullName: "Clienta Chat",
      phone: "+573001234567",
      email: "clienta@prueba.test",
      address: "Calle 1 # 2-3",
      subtotal: 10000,
      total: 10000,
      payment: { create: { storeId: f.store.id, method: PaymentMethod.BankTransfer } },
      shipping: {
        create: {
          storeId: f.store.id,
          provider: ShippingProvider.ENVIOCLICK,
          status: ShippingStatus.Shipped,
          ...(opts.tracking ? { trackingCode: `TRK${randomUUID().slice(0, 6)}`, envioClickIdOrder: Math.floor(Math.random() * 1e8), carrierName: "ENVIA" } : {}),
        },
      },
    },
  });
}

const optIn = async (orderId: string, action: string) => {
  const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/whatsapp-opt-in/route");
  return POST(post({ action }), { params: { storeId: f.store.id, orderId } });
};
const resend = async (orderId: string, milestone: string) => {
  const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/notifications/route");
  return POST(post({ milestone }), { params: { storeId: f.store.id, orderId } });
};

describe("avisos por WhatsApp anotados desde el panel", () => {
  it("sin sesión o sin ser la dueña no cambia nada", async () => {
    const o = await order(OrderSource.WHATSAPP);
    expect((await optIn(o.id, "record")).status).toBe(401);
    session.userId = "otra-persona";
    expect([401, 403]).toContain((await optIn(o.id, "record")).status);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: o.id }, select: { whatsappOptInAt: true } })).resolves.toEqual({ whatsappOptInAt: null });
  });

  it("un pedido de la tienda no se anota desde el panel (409): allá la clienta marca la casilla", async () => {
    session.userId = ownerId;
    const o = await order(OrderSource.STORE);
    expect((await optIn(o.id, "record")).status).toBe(409);
  });

  it("pedido de WhatsApp: queda la hora, la versión, el origen y quién lo anotó; quitarlo marca la baja", async () => {
    session.userId = ownerId;
    const o = await order(OrderSource.WHATSAPP);
    expect((await optIn(o.id, "record")).status).toBe(200);
    await expect(
      testPrisma.order.findUniqueOrThrow({ where: { id: o.id }, select: { whatsappOptInAt: true, whatsappOptInVersion: true, whatsappOptInSource: true, whatsappOptInBy: true, whatsappOptOutAt: true } }),
    ).resolves.toMatchObject({ whatsappOptInAt: expect.any(Date), whatsappOptInVersion: "2026-10-26", whatsappOptInSource: "PANEL_CHAT", whatsappOptInBy: ownerId, whatsappOptOutAt: null });

    expect((await optIn(o.id, "remove")).status).toBe(200);
    const view = await getOrderNotificationsView(testPrisma, { storeId: f.store.id, orderId: o.id });
    expect(view?.whatsapp.optOutAt).toEqual(expect.any(Date));
    // La vista nunca lleva quién lo anotó.
    expect(JSON.stringify(view)).not.toContain(ownerId);
  });

  it("un pedido del panel con una conversación de WhatsApp ligada también se puede anotar", async () => {
    session.userId = ownerId;
    const o = await order(OrderSource.PANEL);
    await testPrisma.conversation.create({ data: { storeId: f.store.id, phone: `57300${Math.floor(Math.random() * 1e7)}`, orderId: o.id } });
    expect((await optIn(o.id, "record")).status).toBe(200);
  });
});

describe("reenviar un aviso", () => {
  it("la dueña reenvía «va en camino»: sale otra vez y queda marcado como reenviado", async () => {
    sent.email.mockImplementation(async (_o: unknown, _m: unknown, roles: string[]) => Object.fromEntries(roles.map((r) => [r, { ok: true, attempts: 1, id: "re_x" }])));
    session.userId = ownerId;
    const o = await order(OrderSource.STORE, { tracking: true });
    expect((await resend(o.id, "guia_creada")).status).toBe(200);
    expect((await resend(o.id, "guia_creada")).status).toBe(200);
    expect(sent.email).toHaveBeenCalledTimes(2);
    const view = await getOrderNotificationsView(testPrisma, { storeId: f.store.id, orderId: o.id });
    expect(view?.rows.filter((r) => r.resent)).toHaveLength(2);
  });

  it("sin guía responde 409 y un hito inventado 400", async () => {
    session.userId = ownerId;
    const o = await order(OrderSource.STORE);
    expect((await resend(o.id, "guia_creada")).status).toBe(409);
    expect((await resend(o.id, "inventado")).status).toBe(400);
    expect(sent.email).not.toHaveBeenCalled();
  });
});
