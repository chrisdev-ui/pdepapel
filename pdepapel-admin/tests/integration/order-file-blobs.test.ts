/// <reference types="vite/client" />
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * Rendimiento P1 (2026-10-15): `GET /orders` devolvía 16,6 MB porque cada
 * pedido traía la guía de envío en PDF (base64). La guía solo sale por
 * `GET /orders/[orderId]/guide`; ningún pedido, lista ni rastreo la trae, y el
 * rastreo no trae la dirección ni el contacto de la clienta.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const envioClick = vi.hoisted(() => ({ trackByOrderId: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/envioclick", () => ({ envioClickClient: envioClick }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined),
  revalidateStorefront: vi.fn().mockResolvedValue(undefined),
}));

const PDF_SENTINEL = Buffer.from("%PDF-1.4 guia-centinela-p1").toString("base64");
const ADDRESS = "Calle Centinela 12 # 34-56";
const CUSTOMER = "user_customer_blobs";

const request = (url: string, init?: RequestInit) =>
  new Request(url, { ...init, headers: { Origin: "https://papeleriapdepapel.com", "content-type": "application/json", ...init?.headers } });
const nextRequest = async (url: string) => {
  const { NextRequest } = await import("next/server");
  return new NextRequest(url, { headers: { Origin: "https://papeleriapdepapel.com" } });
};

function expectNoBlob(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toContain("guidePdfBase64");
  expect(text).not.toContain(PDF_SENTINEL);
}

describe("no file blobs leave the order APIs (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.shippingTrackingEvent.deleteMany({ where: { shipping: { storeId: fixture.store.id } } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
    vi.clearAllMocks();
  });

  async function seedOrder(f: InventoryFixture, owner: { userId?: string; guestId?: string }, createdAt?: Date) {
    return testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        ...owner,
        fullName: "Clienta Centinela",
        phone: "3000000009",
        email: "centinela@prueba.test",
        address: ADDRESS,
        city: "Bogotá",
        subtotal: 10000,
        total: 10000,
        ...(createdAt ? { createdAt } : {}),
        orderItems: { create: [{ productId: f.component.id, quantity: 1, name: "Componente", price: 10000 }] },
        payment: { create: { storeId: f.store.id, method: "Bold" } },
        shipping: {
          create: {
            storeId: f.store.id,
            provider: "ENVIOCLICK",
            status: "Preparing",
            carrierName: "COORDINADORA",
            trackingCode: "970000",
            envioClickIdOrder: 4242,
            guideUrl: "https://guias.test/guia.pdf",
            guidePdfBase64: PDF_SENTINEL,
            destinationData: { address: ADDRESS },
          },
        },
      },
      include: { shipping: { select: { id: true } } },
    });
  }

  it("lists only the session's own orders, slim, paginated, without the guide", async () => {
    fixture = await createInventoryFixture();
    const older = await seedOrder(fixture, { userId: CUSTOMER }, new Date("2026-09-01T00:00:00Z"));
    const newer = await seedOrder(fixture, { userId: CUSTOMER }, new Date("2026-10-01T00:00:00Z"));
    await seedOrder(fixture, { userId: "user_someone_else" });
    const { GET } = await import("@/app/api/[storeId]/orders/route");
    const params = { params: { storeId: fixture.store.id } };
    const url = `http://admin.test/api/${fixture.store.id}/orders`;

    session.userId = CUSTOMER;
    const own = await GET(await nextRequest(url), params);
    expect(own.status).toBe(200);
    expect(own.headers.get("X-Total-Count")).toBe("2");
    const orders = await own.json();
    expect(orders.map((order: { id: string }) => order.id)).toEqual([newer.id, older.id]);
    expectNoBlob(orders);
    expect(JSON.stringify(orders)).not.toContain(ADDRESS);
    expect(Object.keys(orders[0]).sort()).toEqual(
      ["createdAt", "id", "orderItems", "orderNumber", "payment", "shipping", "status", "total", "type"],
    );

    const page2 = await GET(await nextRequest(`${url}?limite=1&pagina=2`), params);
    expect((await page2.json()).map((order: { id: string }) => order.id)).toEqual([older.id]);

    expect((await GET(await nextRequest(`${url}?userId=user_someone_else`), params)).status).toBe(403);

    // La dueña con su sesión ve sus propios pedidos (ninguno), no los de la tienda.
    session.userId = fixture.store.userId;
    expect(await (await GET(await nextRequest(url), params)).json()).toEqual([]);
    const asked = await GET(await nextRequest(`${url}?userId=${CUSTOMER}`), params);
    const askedBody = await asked.json();
    expect(askedBody).toHaveLength(2);
    expectNoBlob(askedBody);
  });

  it("keeps the guide out of the single order and the bulk update, and serves it only to the owner", async () => {
    fixture = await createInventoryFixture();
    const order = await seedOrder(fixture, { userId: CUSTOMER });
    const params = { params: { storeId: fixture.store.id, orderId: order.id } };
    const single = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const bulk = await import("@/app/api/[storeId]/orders/route");
    const guide = await import("@/app/api/[storeId]/orders/[orderId]/guide/route");
    const url = `http://admin.test/api/${fixture.store.id}/orders/${order.id}`;

    session.userId = CUSTOMER;
    const customerView = await single.GET(request(url), params);
    expect(customerView.status).toBe(200);
    expectNoBlob(await customerView.json());
    expect((await guide.GET(request(`${url}/guide`), params)).status).toBe(403);

    session.userId = fixture.store.userId;
    const ownerView = await single.GET(request(url), params);
    const ownerBody = await ownerView.json();
    expect(ownerBody.shipping.guideUrl).toBe("https://guias.test/guia.pdf");
    expectNoBlob(ownerBody);

    const patched = await bulk.PATCH(
      request(`http://admin.test/api/${fixture.store.id}/orders`, {
        method: "PATCH",
        body: JSON.stringify({ ids: [order.id], status: "CANCELLED" }),
      }),
      { params: { storeId: fixture.store.id } },
    );
    expect(patched.status).toBe(200);
    expectNoBlob(await patched.json());

    const pdf = await guide.GET(request(`${url}/guide`), params);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).toString("base64")).toBe(PDF_SENTINEL);
  });

  it("tracks by order id with the order page's rule and returns only tracking fields", async () => {
    fixture = await createInventoryFixture();
    const guestOrder = await seedOrder(fixture, { guestId: `guest-${randomUUID()}` });
    const accountOrder = await seedOrder(fixture, { userId: CUSTOMER });
    envioClick.trackByOrderId.mockResolvedValue({
      data: [{ status: "En tránsito", description: "En camino", location: "Bogotá", date: "2026-10-14T10:00:00Z" }],
    });
    const { POST } = await import("@/app/api/[storeId]/shipment/track/route");
    const params = { params: { storeId: fixture.store.id } };
    const track = (body: object) =>
      POST(request(`http://admin.test/api/${fixture!.store.id}/shipment/track`, { method: "POST", body: JSON.stringify(body) }), params);

    const guest = await track({ orderId: guestOrder.id });
    expect(guest.status).toBe(200);
    const body = await guest.json();
    expectNoBlob(body);
    const text = JSON.stringify(body);
    for (const leak of [ADDRESS, "guideUrl", "destinationData", "originData", "fullName", "phone", "email", "tracking\""]) {
      expect(text, leak).not.toContain(leak);
    }
    expect(body.shipping).toMatchObject({ status: "InTransit", carrierName: "COORDINADORA", trackingCode: "970000" });
    expect(body.events).toEqual([expect.objectContaining({ status: "En tránsito", location: "Bogotá" })]);

    // Un id de envío que no es de ese pedido no sirve, y el id de invitada ya no es llave.
    expect((await track({ orderId: guestOrder.id, shippingId: accountOrder.shipping!.id })).status).toBe(404);
    expect((await track({ shippingId: guestOrder.shipping!.id, guestId: guestOrder.guestId })).status).toBe(401);

    // El pedido de una clienta con cuenta solo se rastrea con su sesión.
    expect((await track({ orderId: accountOrder.id })).status).toBe(404);
    session.userId = CUSTOMER;
    expect((await track({ orderId: accountOrder.id })).status).toBe(200);
    expect((await track({ shippingId: accountOrder.shipping!.id })).status).toBe(200);
    session.userId = "user_someone_else";
    expect((await track({ shippingId: accountOrder.shipping!.id })).status).toBe(404);

    // El panel sigue rastreando por id de envío con la sesión de la dueña.
    session.userId = fixture.store.userId;
    expect((await track({ shippingId: guestOrder.shipping!.id })).status).toBe(200);
  });
});
