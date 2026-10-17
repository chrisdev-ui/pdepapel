import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderType, PaymentMethod } from "@prisma/client";

import { solveCodFee } from "@/lib/cod-fee";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Recaudo contra entrega (decisión 2026-10-15: lo paga la clienta, aparte
 * del envío). La tienda manda los pedidos contra entrega a POST /orders:
 * - tienda de antes (sin `codFeeShown`): sin recaudo, pero el flete lo cotiza el servidor (2026-10-17);
 * - tienda nueva con el recaudo que mostró: el servidor lo recalcula con dos
 *   cotizaciones con recaudo y lo cobra; si no coincide, 409 con el total nuevo;
 * - envío gratis + contra entrega: envío 0 y recaudo aparte;
 * - el panel guarda el recaudo de su cotización y lo quita si deja de ser contra entrega;
 * - la guía recauda el total completo, recaudo incluido.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const envioclick = vi.hoisted(() => ({ quoteShipment: vi.fn(), createShipment: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/envioclick")>();
  return { ...actual, envioClickClient: { quoteShipment: envioclick.quoteShipment, createShipment: envioclick.createShipment } };
});
vi.mock("@/lib/resource-lock", () => ({
  withResourceLock: (_key: string, _message: string, run: () => Promise<unknown>) => run(),
  ResourceBusyError: class ResourceBusyError extends Error {},
}));
vi.mock("@/lib/bold", () => ({ generateBoldCheckoutData: (order: { id: string }) => ({ orderId: order.id, integritySignature: "sig" }) }));
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

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });

const customer = { fullName: "Clienta Contra Entrega", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "La Dorada", department: "Caldas", daneCode: "17380000" };

/** ENVIA: 3 % del valor a recaudar + 3.000. Coordinadora: plano. Precios ficticios. */
const enviaFee = (codValue: number) => 0.03 * codValue + 3000;
const FREIGHT = 18000;
const quoteRates = (codValue?: number) => [
  { idRate: 5000 + (codValue ?? 0), idCarrier: 1, idProduct: 1, carrier: "ENVIA", product: "Normal", flete: FREIGHT, minimumInsurance: 0, extraInsurance: 0, deliveryDays: 3, distance: null, quotationType: "", cod: Boolean(codValue), codDetails: codValue ? { codCost: enviaFee(codValue), codCostWithInsurance: 0, codPaymentMethod: "cash", includeGuideCost: false } : null },
  { idRate: 6000 + (codValue ?? 0), idCarrier: 2, idProduct: 1, carrier: "COORDINADORA", product: "Normal", flete: 25000, minimumInsurance: 0, extraInsurance: 0, deliveryDays: 4, distance: null, quotationType: "", cod: Boolean(codValue), codDetails: codValue ? { codCost: 6000, codCostWithInsurance: 0, codPaymentMethod: "cash", includeGuideCost: false } : null },
];

/** Lo que el servidor debe cobrar para un pedido de `amount` sin envío: el punto fijo exacto. */
const expectedFee = (amount: number, shipping: number) => {
  const base = amount + shipping;
  const v2 = amount + Math.max(shipping + enviaFee(amount), shipping);
  return solveCodFee(base, { codValue: amount, fee: enviaFee(amount) }, { codValue: v2, fee: enviaFee(v2) });
};

describe("recaudo contra entrega en POST /orders (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let price = 0;

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

  const setup = async () => {
    fixture = await createInventoryFixture();
    price = Number(fixture.component.price);
    envioclick.quoteShipment.mockImplementation(async (body: { codValue?: number }) => ({ data: { packages: [], rates: quoteRates(body.codValue), idCarriersNoWsResult: [] } }));
    return fixture;
  };

  const storeOrder = (f: InventoryFixture, shipping: Record<string, unknown>, total: number, method: PaymentMethod = PaymentMethod.COD) => ({
    ...customer,
    guestId: `guest_${randomUUID()}`,
    type: OrderType.STANDARD,
    orderItems: [{ productId: f.component.id, quantity: 1 }],
    payment: { method },
    shippingProvider: "ENVIOCLICK",
    envioClickIdRate: 777,
    shipping: { carrierName: "ENVIA", courier: "ENVIA", productName: "Normal", flete: FREIGHT, minimumInsurance: 0, deliveryDays: 3, isCOD: method === PaymentMethod.COD, ...shipping },
    subtotal: price,
    total,
  });

  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    return POST(json("POST", body), { params: { storeId: fixture!.store.id } });
  };
  const saved = async (response: Response) => {
    const data = (await response.json()) as { id: string };
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: data.id }, select: { id: true, total: true, shipping: { select: { envioClickIdRate: true, isCOD: true, cost: true, codFee: true } } } });
    return order;
  };

  it("contra entrega sin recaudo mostrado: sin recaudo, con el flete y la tarifa que cotiza el servidor con recaudo", async () => {
    const f = await setup();
    const response = await post(storeOrder(f, { cost: FREIGHT }, price + FREIGHT));
    expect(response.status).toBe(200);
    const order = await saved(response);
    expect(order).toMatchObject({ total: price + FREIGHT, shipping: { envioClickIdRate: 5000 + price, isCOD: true, cost: FREIGHT, codFee: null } });
    expect(envioclick.quoteShipment).toHaveBeenCalledTimes(1);
    expect(envioclick.quoteShipment.mock.calls[0][0]).toMatchObject({ codValue: price });
  });

  describe("transferencia desde la tienda: el flete nunca es el que manda el cliente", () => {
    const transfer = (f: InventoryFixture, cost: number, total: number) => ({ ...storeOrder(f, { cost, isCOD: false }, total, PaymentMethod.BankTransfer) });

    it("normal: se cotiza, se guarda la tarifa del servidor y el total cuadra", async () => {
      const f = await setup();
      const response = await post(transfer(f, FREIGHT, price + FREIGHT));
      expect(response.status).toBe(200);
      const order = await saved(response);
      expect(order).toMatchObject({ total: price + FREIGHT, shipping: { envioClickIdRate: 5000, isCOD: false, cost: FREIGHT, codFee: null } });
      expect(envioclick.quoteShipment.mock.calls[0][0].codValue).toBeUndefined();
    });

    it("flete alterado y total a juego: 409 con la tarifa real y ningún pedido", async () => {
      const f = await setup();
      const response = await post(transfer(f, 1000, price + 1000));
      expect(response.status).toBe(409);
      const body = (await response.json()) as { details: { code: string; rate: { totalCost: number }; previousCost: number } };
      expect(body.details).toMatchObject({ code: "SHIPPING_RATE_CHANGED", previousCost: 1000, rate: { totalCost: FREIGHT } });
      await expect(testPrisma.order.count({ where: { storeId: f.store.id } })).resolves.toBe(0);
    });

    it("con la tarifa en una cotización vigente, un flete distinto al de esa cotización se rechaza", async () => {
      const f = await setup();
      await testPrisma.shippingQuote.create({
        data: {
          storeId: f.store.id,
          originDaneCode: "05001000",
          destDaneCode: customer.daneCode,
          weight: 1,
          declaredValue: price,
          quotesData: [{ idRate: 777, idCarrier: 1, idProduct: 1, carrier: "ENVIA", product: "Normal", flete: FREIGHT, minimumInsurance: 0, totalCost: FREIGHT, deliveryDays: 3, isCOD: false, codCost: null }],
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const tampered = await post(transfer(f, 1000, price + 1000));
      expect(tampered.status).toBe(400);
      await expect(testPrisma.order.count({ where: { storeId: f.store.id } })).resolves.toBe(0);

      const honest = await post({ ...transfer(f, FREIGHT, price + FREIGHT), guestId: `guest_${randomUUID()}` });
      expect(honest.status).toBe(200);
      expect((await saved(honest)).shipping).toMatchObject({ envioClickIdRate: 777, cost: FREIGHT });
      expect(envioclick.quoteShipment).not.toHaveBeenCalled();
    });

    it("envío gratis: el servidor lo aplica aunque el cliente mande un flete", async () => {
      const f = await setup();
      await testPrisma.store.update({ where: { id: f.store.id }, data: { freeShippingThreshold: price } });
      const response = await post(transfer(f, 0, price));
      expect(response.status).toBe(200);
      expect((await saved(response)).shipping).toMatchObject({ cost: 0 });
    });

    it("«se acuerda por WhatsApp»: el pedido no cobra envío aunque el cuerpo traiga uno", async () => {
      const f = await setup();
      const body = { ...transfer(f, 50_000, price), shippingProvider: "MANUAL", envioClickIdRate: 0 };
      const response = await post(body);
      expect(response.status).toBe(200);
      expect((await saved(response)).shipping).toMatchObject({ cost: 0 });
      expect(envioclick.quoteShipment).not.toHaveBeenCalled();
    });
  });

  it("una clienta no puede ponerse el recaudo: un `codFee` que llega de la tienda no cuenta", async () => {
    const f = await setup();
    const response = await post(storeOrder(f, { cost: FREIGHT, codFee: 1 }, price + FREIGHT));
    expect(response.status).toBe(200);
    expect((await saved(response)).shipping?.codFee).toBeNull();
  });

  it("tienda nueva, recaudo igual: se cobra aparte del envío y la guía recauda el total completo", async () => {
    const f = await setup();
    const fee = expectedFee(price, FREIGHT);
    const response = await post(storeOrder(f, { cost: FREIGHT, codFeeShown: fee }, price + FREIGHT + fee));
    expect(response.status).toBe(200);
    const order = await saved(response);
    expect(order.total).toBe(price + FREIGHT + fee);
    expect(order.shipping).toMatchObject({ isCOD: true, cost: FREIGHT, codFee: fee });
    // El idRate es el de la segunda cotización con recaudo, no el que mandó la tienda.
    expect(order.shipping?.envioClickIdRate).toBe(5000 + envioclick.quoteShipment.mock.calls[1][0].codValue);
    expect(envioclick.quoteShipment.mock.calls[0][0]).toMatchObject({ codValue: price, codPaymentMethod: "cash" });

    session.userId = f.store.userId;
    envioclick.createShipment.mockResolvedValue({ data: { idOrder: 9, tracker: "G9", url: "https://guia.test/9", guide: "", requestPickup: true, external_order_id: "x", origin: {}, destination: {} } });
    const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
    const guide = await POST(json("POST", {}), { params: { storeId: f.store.id, orderId: order.id } });
    expect(guide.status).toBe(200);
    expect(envioclick.createShipment.mock.calls[0][0]).toMatchObject({ codValue: price + FREIGHT + fee, idRate: order.shipping?.envioClickIdRate });
  });

  it("tienda nueva, recaudo distinto: 409 con el recaudo y el total nuevos, sin pedido", async () => {
    const f = await setup();
    const fee = expectedFee(price, FREIGHT);
    const response = await post(storeOrder(f, { cost: FREIGHT, codFeeShown: fee - 500 }, price + FREIGHT + fee - 500));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { details: Record<string, unknown> };
    expect(body.details).toMatchObject({ code: "SHIPPING_RATE_CHANGED", codFee: fee, previousCodFee: fee - 500, newTotal: price + FREIGHT + fee });
    await expect(testPrisma.order.count({ where: { storeId: f.store.id } })).resolves.toBe(0);
  });

  it("envío gratis + contra entrega: envío 0, «Gratis», y el recaudo aparte sobre el pedido sin envío", async () => {
    const f = await setup();
    await testPrisma.store.update({ where: { id: f.store.id }, data: { freeShippingThreshold: price } });
    const fee = expectedFee(price, 0);
    const response = await post(storeOrder(f, { cost: 0, codFeeShown: fee }, price + fee));
    expect(response.status).toBe(200);
    const order = await saved(response);
    expect(order.total).toBe(price + fee);
    expect(order.shipping).toMatchObject({ cost: 0, codFee: fee, isCOD: true });
  });

  it("panel: guarda el recaudo de su cotización y lo quita al pasar a transferencia", async () => {
    const f = await setup();
    session.userId = f.store.userId;
    const response = await post({ ...storeOrder(f, { cost: FREIGHT, codFee: 7000 }, price + FREIGHT + 7000), guestId: undefined, status: "PENDING" });
    expect(response.status).toBe(200);
    const order = await saved(response);
    expect(order).toMatchObject({ total: price + FREIGHT + 7000, shipping: { codFee: 7000, cost: FREIGHT } });

    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const patched = await PATCH(
      json("PATCH", {
        ...customer,
        skipAutoGuide: true,
        orderItems: [{ productId: f.component.id, quantity: 1 }],
        payment: { method: PaymentMethod.BankTransfer },
        shippingProvider: "ENVIOCLICK",
        envioClickIdRate: 777,
        shipping: { carrierName: "ENVIA", courier: "ENVIA", productName: "Normal", isCOD: false, cost: FREIGHT, codFee: null },
      }),
      { params: { storeId: f.store.id, orderId: order.id } },
    );
    expect(patched.status).toBe(200);
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { total: true, shipping: { select: { codFee: true, isCOD: true } } } });
    expect(after).toEqual({ total: price + FREIGHT, shipping: { codFee: null, isCOD: false } });
  });

  it("pago en línea con envío gratis (/checkout): sin recaudo", async () => {
    const f = await setup();
    await testPrisma.store.update({ where: { id: f.store.id }, data: { freeShippingThreshold: price } });
    const { POST } = await import("@/app/api/[storeId]/checkout/route");
    const response = await POST(
      json("POST", { ...storeOrder(f, { cost: 0, codFeeShown: 999 }, price, PaymentMethod.Bold), envioClickIdRate: 5000 }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { order?: { id: string }; id?: string };
    const orderId = data.order?.id ?? data.id!;
    await expect(testPrisma.shipping.findFirstOrThrow({ where: { orderId }, select: { cost: true, codFee: true } })).resolves.toEqual({ cost: 0, codFee: null });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { total: true } })).resolves.toEqual({ total: price });
  });
});
