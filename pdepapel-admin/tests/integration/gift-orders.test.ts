import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { INTERNAL_ORDER_FIELDS } from "@/lib/public-orders";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

/**
 * Pedidos como regalo contra MySQL: el panel y la tienda guardan a quien
 * recibe junto a quien compra, un cambio de estado no borra el regalo,
 * apagar la bandera limpia los datos de la otra persona, y la ruta pública
 * del pedido muestra el nombre y el mensaje pero nunca el correo ni el
 * teléfono de quien recibe.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn().mockResolvedValue({ data: { idOrder: 1, tracker: "T" } }) }));
vi.mock("@upstash/redis", () => {
  const client = { get: async () => null, set: async () => "OK", del: async () => 1, scan: async () => [0, []] };
  class Redis {
    static fromEnv() {
      return client;
    }
    get = client.get;
    set = client.set;
    del = client.del;
    scan = client.scan;
  }
  return { Redis };
});

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });
const get = () => new Request("http://admin.test/api/x", { headers: { Origin: "https://papeleriapdepapel.com" } });

const buyer = { fullName: "Luisa Sánchez", phone: "+573009999999", email: "luisa@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };
const gift = { isGift: true, giftRecipientName: "Mariana López", giftRecipientEmail: "Mariana@Prueba.test", giftRecipientPhone: "300 123 4567", giftMessage: "¡Feliz cumpleaños!" };

describe("gift orders with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const createViaPanel = async (f: InventoryFixture, extra: Record<string, unknown> = {}) => {
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const response = await POST(
      json("POST", { ...buyer, type: OrderType.STANDARD, payment: { method: PaymentMethod.BankTransfer }, orderItems: [{ productId: f.component.id, quantity: 1 }], subtotal: 10000, total: 10000, ...extra }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; status: OrderStatus };
  };

  it("stores the recipient next to the buyer and keeps it through a status change", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const created = await createViaPanel(fixture, gift);

    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({
      fullName: "Luisa Sánchez",
      email: "luisa@prueba.test",
      isGift: true,
      giftRecipientName: "Mariana López",
      giftRecipientEmail: "mariana@prueba.test",
      giftRecipientPhone: "+573001234567",
      giftMessage: "¡Feliz cumpleaños!",
    });

    // Marcar pagado no habla de regalo: nada se borra.
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const paid = await PATCH(
      json("PATCH", { status: OrderStatus.PAID, expectedStatus: created.status, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" } }),
      { params: { storeId: fixture.store.id, orderId: created.id } },
    );
    expect(paid.status).toBe(200);
    const afterPaid = await testPrisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterPaid.status).toBe(OrderStatus.PAID);
    expect(afterPaid.giftRecipientName).toBe("Mariana López");
    expect(afterPaid.giftRecipientEmail).toBe("mariana@prueba.test");
  });

  it("clears the other person's data when the gift flag is switched off", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const created = await createViaPanel(fixture, gift);

    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const response = await PATCH(
      json("PATCH", { ...buyer, expectedStatus: created.status, isGift: false, giftRecipientName: "Mariana López", giftRecipientEmail: "mariana@prueba.test" }),
      { params: { storeId: fixture.store.id, orderId: created.id } },
    );
    expect(response.status).toBe(200);

    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored).toMatchObject({ isGift: false, giftRecipientName: null, giftRecipientEmail: null, giftRecipientPhone: null, giftMessage: null });
  });

  it("refuses a gift without a recipient name from the panel too", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const response = await POST(
      json("POST", { ...buyer, type: OrderType.STANDARD, payment: { method: PaymentMethod.BankTransfer }, orderItems: [{ productId: fixture.component.id, quantity: 1 }], subtotal: 10000, total: 10000, isGift: true, giftRecipientName: " " }),
      { params: { storeId: fixture.store.id } },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Escribe el nombre de quien recibe el regalo" });
  });

  it("shows the buyer who the gift is for on the public order page, never the recipient's contact", async () => {
    fixture = await createInventoryFixture();
    const order = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-${randomUUID().slice(0, 8)}`,
        ...buyer,
        subtotal: 10000,
        total: 10000,
        isGift: true,
        giftRecipientName: "Mariana López",
        giftRecipientEmail: "mariana@prueba.test",
        giftRecipientPhone: "+573001234567",
        giftMessage: "¡Feliz cumpleaños!",
        orderItems: { create: [{ productId: fixture.component.id, quantity: 1, name: "Componente", price: 10000 }] },
      },
    });

    const { GET } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const response = await GET(get(), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    const publicOrder = await response.json();
    expect(publicOrder).toMatchObject({ isGift: true, giftRecipientName: "Mariana López", giftMessage: "¡Feliz cumpleaños!", email: "luisa@prueba.test" });
    expect(INTERNAL_ORDER_FIELDS).toEqual(expect.arrayContaining(["giftRecipientEmail", "giftRecipientPhone"]));
    for (const field of INTERNAL_ORDER_FIELDS) expect(publicOrder, `campo interno «${field}»`).not.toHaveProperty(field);
  });
});
