import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Contra entrega con tarjeta de regalo: la guía recauda lo que la clienta
 * debe al recibir (total − tarjeta), nunca el total; si la tarjeta lo cubre
 * todo, no hay guía contra entrega y Paula ve por qué.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const envioclick = vi.hoisted(() => ({ createShipment: vi.fn(), quoteShipment: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/envioclick", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/envioclick")>();
  return { ...actual, envioClickClient: { createShipment: envioclick.createShipment, quoteShipment: envioclick.quoteShipment } };
});
vi.mock("@/lib/resource-lock", () => ({
  withResourceLock: (_key: string, _message: string, run: () => Promise<unknown>) => run(),
  ResourceBusyError: class ResourceBusyError extends Error {},
}));

const request = () => new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

describe("guía contra entrega con tarjeta de regalo", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    session.userId = null;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const codOrder = async (giftCardAmount: number) => {
    const f = await createInventoryFixture();
    fixture = f;
    session.userId = f.store.userId;
    return testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        fullName: "Clienta Prueba",
        phone: "+573001234567",
        email: "clienta@prueba.test",
        address: "Calle 1 # 2-3",
        city: "La Dorada",
        department: "Caldas",
        daneCode: "17380000",
        subtotal: 50000,
        total: 75000,
        giftCardAmount,
        orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 50000 }] },
        payment: { create: { storeId: f.store.id, method: PaymentMethod.COD } },
        shipping: { create: { storeId: f.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing, isCOD: true, envioClickIdRate: 4242, cost: 18000, codFee: 7000 } },
      },
    });
  };

  const createGuide = async (orderId: string) => {
    envioclick.createShipment.mockResolvedValue({ data: { idOrder: 1, tracker: "G1", url: "https://guia.test/1", guide: "", requestPickup: true, external_order_id: "x", origin: {}, destination: {} } });
    const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
    return POST(request(), { params: { storeId: fixture!.store.id, orderId } });
  };

  it("tarjeta parcial: recauda el total menos la tarjeta", async () => {
    const order = await codOrder(30000);
    const response = await createGuide(order.id);
    expect(response.status).toBe(200);
    expect(envioclick.createShipment.mock.calls[0][0]).toMatchObject({ codValue: 45000 });
  });

  it("tarjeta que lo cubre todo: no hay guía contra entrega y se dice por qué", async () => {
    const order = await codOrder(75000);
    const response = await createGuide(order.id);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("La tarjeta de regalo cubre todo el pedido");
    expect(envioclick.createShipment).not.toHaveBeenCalled();

    const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/shipping/requote-and-guide/route");
    const requote = await POST(request(), { params: { storeId: fixture!.store.id, orderId: order.id } });
    expect(requote.status).toBe(400);
    expect(envioclick.quoteShipment).not.toHaveBeenCalled();
  });

  it("sin tarjeta: recauda el total, como antes", async () => {
    const order = await codOrder(0);
    const response = await createGuide(order.id);
    expect(response.status).toBe(200);
    expect(envioclick.createShipment.mock.calls[0][0]).toMatchObject({ codValue: 75000 });
  });
});
