import { randomUUID } from "node:crypto";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MASKED_RECEIPT_SHAPE, type ShapeType } from "../fixtures/masked-receipt-shape";
import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
const envioClick = vi.hoisted(() => ({ trackByOrderId: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("@/lib/envioclick", () => ({ envioClickClient: envioClick }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from "@/app/api/[storeId]/orders/[orderId]/route";
import { POST as track } from "@/app/api/[storeId]/shipment/track/route";

/**
 * Paso A2 del recibo: quien abre `/pedido/<id>` solo con el enlace (pedido de
 * invitada o creado en el panel) recibe el recibo recortado con la forma del
 * fixture de la tienda; la clienta con sesión dueña, la dueña del panel y la
 * cuenta de solo lectura siguen como estaban; otra cuenta sigue en 404.
 */
const CUSTOMER = "user_cuenta_a2";
let fixture: InventoryFixture | undefined;
const ids: Record<string, string> = {};

async function createOrder(key: string, status: OrderStatus, extra: Record<string, unknown> = {}) {
  const order = await testPrisma.order.create({
    data: {
      storeId: fixture!.store.id,
      orderNumber: `ORD-A2-${randomUUID().slice(0, 8)}`,
      status,
      type: OrderType.STANDARD,
      fullName: "Clienta Ejemplo Prueba",
      phone: "3000000000",
      email: "clienta@example.test",
      address: "Calle Ejemplo 1",
      address2: "Apto 2",
      neighborhood: "Centro",
      addressReference: "Portería azul",
      company: "Empresa Ejemplo",
      documentId: "documento-ejemplo",
      adminNotes: "nota de la dueña",
      internalNotes: "nota interna",
      riskScore: 40,
      riskReasons: "razón de prueba",
      city: "Medellín",
      department: "Antioquia",
      subtotal: 10000,
      total: 10000,
      ...(status === OrderStatus.PAID ? { paidAt: new Date() } : {}),
      payment: { create: { method: PaymentMethod.Bold, storeId: fixture!.store.id, transactionId: `TX-${key}` } },
      shipping: {
        create: {
          storeId: fixture!.store.id,
          provider: "ENVIOCLICK",
          status: "Preparing",
          carrierName: "COORDINADORA",
          trackingCode: `GUIA-${key}`,
          trackingUrl: `https://rastreo.example.test/GUIA-${key}`,
          envioClickIdOrder: 4242,
        },
      },
      orderItems: { create: [{ productId: fixture!.component.id, quantity: 2, name: "Componente", price: 5000 }] },
      ...extra,
    } as never,
  });
  ids[key] = order.id;
}

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  await createOrder("guest", OrderStatus.PAID, { guestId: `guest-${randomUUID()}` });
  await createOrder("panel", OrderStatus.CANCELLED, { createdBy: fixture.store.userId });
  await createOrder("panelAssigned", OrderStatus.PENDING, { createdBy: fixture.store.userId, userId: CUSTOMER });
  await createOrder("gift", OrderStatus.PAID, {
    guestId: `guest-${randomUUID()}`,
    isGift: true,
    giftRecipientName: "Lucía Receptora",
    giftRecipientEmail: "receptora@example.test",
    giftRecipientPhone: "3000000001",
    giftMessage: "Mensaje de regalo",
  });
  await createOrder("account", OrderStatus.PAID, { userId: CUSTOMER, isGift: true, giftRecipientName: "Lucía Receptora", giftMessage: "Mensaje de regalo" });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.shippingTrackingEvent.deleteMany({ where: { shipping: { storeId: fixture.store.id } } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

type Who = "anonymous" | "stranger" | "customer" | "otherAccount" | "owner" | "viewer";
const as = (who: Who) => {
  session.userId = { anonymous: null, stranger: "user_extrana_a2", customer: CUSTOMER, otherAccount: "user_otra_a2", owner: fixture!.store.userId, viewer: "user_viewer_a2" }[who];
  session.claims = who === "viewer" ? { metadata: { role: "viewer", allowedStoreIds: [fixture!.store.id] } } : {};
};
const fetchOrder = async (key: string) => GET(new Request("http://admin.test/x"), { params: { storeId: fixture!.store.id, orderId: ids[key] } });
const fetchJson = async (key: string) => (await fetchOrder(key)).json();

const typeOf = (value: unknown) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
const fits = (type: ShapeType, value: unknown) => (type === "string|null" ? value === null || typeof value === "string" : typeOf(value) === type);
function expectShape(body: Record<string, unknown>, shape: Record<string, ShapeType>, where: string) {
  for (const [key, type] of Object.entries(shape)) {
    expect(Object.prototype.hasOwnProperty.call(body, key), `${where}.${key} presente`).toBe(true);
    expect(fits(type, body[key]), `${where}.${key} es ${type} (llegó ${typeOf(body[key])})`).toBe(true);
  }
}

function expectMaskedReceipt(body: Record<string, any>) {
  expect(body.masked).toBe(true);
  assertNoForbiddenKeys(body, "linkHolder");
  for (const key of MASKED_RECEIPT_SHAPE.removed) expect(body, key).not.toHaveProperty(key);
  for (const key of MASKED_RECEIPT_SHAPE.removedFromPayment) expect(body.payment, key).not.toHaveProperty(key);
  expect(body.fullName).toMatch(MASKED_RECEIPT_SHAPE.patterns.fullName);
  expect(body.phone).toMatch(MASKED_RECEIPT_SHAPE.patterns.phone);
  expect(body.email).toMatch(MASKED_RECEIPT_SHAPE.patterns.email);
  const text = JSON.stringify(body);
  for (const value of ["Clienta Ejemplo Prueba", "3000000000", "clienta@example.test", "Calle Ejemplo", "Empresa Ejemplo", "documento-ejemplo", "nota", "TX-"]) {
    expect(text, value).not.toContain(value);
  }
  // Lo que la tienda necesita sigue igual.
  expect(body).toMatchObject({ city: "Medellín", department: "Antioquia", total: 10000, orderItems: [expect.objectContaining({ quantity: 2, name: "Componente" })] });
  expect(body.shipping).toMatchObject({ carrierName: "COORDINADORA", status: "Preparing", trackingCode: expect.stringMatching(/^GUIA-/), trackingUrl: expect.stringMatching(/^https:\/\//) });
}

describe("GET /orders/[orderId] recortado para quien solo tiene el enlace (A2)", () => {
  it("pedido de invitada sin sesión: recortado, sin claves prohibidas, guía visible", async () => {
    as("anonymous");
    const body = await fetchJson("guest");
    expectMaskedReceipt(body);
    expect(body).toMatchObject({ fullName: "Clienta P.", phone: "•••• 0000", email: "c***@example.test", paymentResult: "approved" });
  });

  it("pedido creado en el panel sin sesión: recortado igual", async () => {
    as("anonymous");
    const body = await fetchJson("panel");
    expectMaskedReceipt(body);
    expect(body).toMatchObject({ paymentResult: "declined", createdByAdmin: true });
  });

  it("pedido de regalo: quien recibe recortado, sin mensaje ni contacto de quien recibe; forma del fixture de la tienda", async () => {
    as("anonymous");
    const body = await fetchJson("gift");
    expectMaskedReceipt(body);
    expect(body).toMatchObject({ isGift: true, giftRecipientName: "Lucía R." });
    expect(JSON.stringify(body)).not.toContain("Mensaje de regalo");
    expect(JSON.stringify(body)).not.toContain("receptora@example.test");
    expectShape(body, MASKED_RECEIPT_SHAPE.order, "pedido");
    expectShape(body.payment, MASKED_RECEIPT_SHAPE.payment, "payment");
    expectShape(body.shipping, MASKED_RECEIPT_SHAPE.shipping, "shipping");
    expect(body.giftRecipientName).toMatch(MASKED_RECEIPT_SHAPE.patterns.giftRecipientName);
  });

  it("con sesión de otra persona, el enlace de una invitada también llega recortado", async () => {
    as("stranger");
    expectMaskedReceipt(await fetchJson("guest"));
  });

  it("la clienta con sesión dueña ve su pedido completo, aunque lo haya creado el panel", async () => {
    as("customer");
    for (const key of ["account", "panelAssigned"]) {
      const body = await fetchJson(key);
      expect(body).toMatchObject({ masked: false, fullName: "Clienta Ejemplo Prueba", phone: "3000000000", address: "Calle Ejemplo 1", company: "Empresa Ejemplo", payment: { transactionId: `TX-${key}` } });
    }
    expect(await fetchJson("account")).toMatchObject({ paymentResult: "approved", giftRecipientName: "Lucía Receptora", giftMessage: "Mensaje de regalo" });
    expect((await fetchJson("panelAssigned")).paymentResult).toBe("pending");
  });

  it("el pedido del panel asignado a una clienta: sin su sesión llega recortado", async () => {
    as("anonymous");
    const body = await fetchJson("panelAssigned");
    expectMaskedReceipt(body);
    expect(body.paymentResult).toBe("pending");
  });

  it("otra cuenta o sin sesión: el pedido de una cuenta sigue en 404", async () => {
    as("otherAccount");
    expect((await fetchOrder("account")).status).toBe(404);
    as("anonymous");
    expect((await fetchOrder("account")).status).toBe(404);
  });

  it("dueña del panel y solo lectura: sin cambios", async () => {
    as("owner");
    expect(await fetchJson("guest")).toMatchObject({ masked: false, paymentResult: "approved", fullName: "Clienta Ejemplo Prueba", payment: { transactionId: "TX-guest" } });
    as("viewer");
    const viewer = await fetchJson("gift");
    expect(viewer).toMatchObject({ masked: false, paymentResult: "approved" });
    assertNoForbiddenKeys(viewer, "viewer");
  });
});

describe("POST /shipment/track sin el número de guía para quien solo tiene el enlace (A2)", () => {
  const trackBody = async (orderId: string) => {
    const response = await track(
      new Request(`http://admin.test/api/${fixture!.store.id}/shipment/track`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId }),
      }),
      { params: { storeId: fixture!.store.id } },
    );
    return { status: response.status, body: await response.json() };
  };

  it("enlace: los eventos siguen, la guía no; la clienta dueña y la dueña del panel sí la reciben", async () => {
    envioClick.trackByOrderId.mockResolvedValue({
      data: [{ status: "En tránsito", description: "En camino", location: "Bogotá", date: "2026-10-14T10:00:00Z" }],
    });

    as("anonymous");
    const guest = await trackBody(ids.guest);
    expect(guest.status).toBe(200);
    expect(guest.body.events).toEqual([expect.objectContaining({ status: "En tránsito", location: "Bogotá" })]);
    expect(guest.body.shipping).toMatchObject({ status: "InTransit", carrierName: "COORDINADORA" });
    expect(guest.body.shipping).not.toHaveProperty("trackingCode");
    expect(guest.body.shipping).not.toHaveProperty("trackingUrl");
    expect(JSON.stringify(guest.body)).not.toContain("GUIA-");

    as("customer");
    const own = await trackBody(ids.panelAssigned);
    expect(own.body.shipping).toMatchObject({ trackingCode: "GUIA-panelAssigned" });
    expect(own.body.events.length).toBeGreaterThan(0);

    as("owner");
    expect((await trackBody(ids.guest)).body.shipping).toMatchObject({ trackingCode: "GUIA-guest" });
  });
});
