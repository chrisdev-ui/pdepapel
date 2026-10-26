import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderType, PaymentMethod } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * La tienda cotiza siempre con recaudo, así que su cotización nunca está en
 * la caché y el checkout re-cotiza. Hasta 2026-10-15 lo hacía sin recaudo y
 * un pedido contra entrega quedaba con una tarifa prepagada y
 * `shipping.isCOD = false` (ORD-1791998787841-915): la guía salía rechazada.
 * Ahora, con «contra entrega», se re-cotiza con recaudo y se guarda la tarifa
 * que recauda de la transportadora elegida; sin pago contra entrega todo
 * sigue igual. Lo que paga la clienta sigue siendo flete + seguro.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const envioclick = vi.hoisted(() => ({ quoteShipment: vi.fn() }));

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
  return { ...actual, envioClickClient: { quoteShipment: envioclick.quoteShipment, createShipment: vi.fn() } };
});
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

const json = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });

const customer = { fullName: "Clienta Contra Entrega", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "La Dorada", department: "Caldas", daneCode: "17380000" };

const rate = (idRate: number, carrier: string, flete: number, cod: boolean, codCost: number | null = null) => ({
  idRate,
  idCarrier: carrier === "ENVIA" ? 1 : 2,
  idProduct: 1,
  carrier,
  product: "Normal",
  flete,
  minimumInsurance: 0,
  extraInsurance: 0,
  deliveryDays: 3,
  distance: null,
  quotationType: "",
  cod,
  codDetails: cod ? { codCost, codCostWithInsurance: codCost, codPaymentMethod: "cash", includeGuideCost: false } : null,
});

/** Lo que devuelve EnvioClick: sin recaudo solo las prepagadas; con recaudo, las dos clases. */
const respond = (withCod: ReturnType<typeof rate>[], prepaid: ReturnType<typeof rate>[]) =>
  envioclick.quoteShipment.mockImplementation(async (body: { codValue?: number }) => ({
    data: { packages: [], rates: body.codValue ? [...prepaid, ...withCod] : prepaid, idCarriersNoWsResult: [] },
  }));

const checkoutBody = (f: InventoryFixture, method: PaymentMethod, shipping: Record<string, unknown>) => ({
  ...customer,
  guestId: `guest_${randomUUID()}`,
  type: OrderType.STANDARD,
  orderItems: [{ productId: f.component.id, quantity: 1 }],
  payment: { method },
  shipping: { provider: "ENVIOCLICK", product: "Normal", productName: "Normal", ...shipping },
  subtotal: 10000,
  total: 10000 + Number(shipping.cost ?? 0),
});

describe("checkout contra entrega con EnvioClick (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const checkout = async (body: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/[storeId]/checkout/route");
    return POST(json(body), { params: { storeId: fixture!.store.id } });
  };
  const savedShipping = async (response: Response) => {
    const data = (await response.json()) as { id?: string; order?: { id: string } };
    const orderId = data.id ?? data.order!.id;
    return testPrisma.shipping.findFirstOrThrow({ where: { orderId }, select: { envioClickIdRate: true, carrierName: true, isCOD: true, cost: true } });
  };

  it("contra entrega: re-cotiza con recaudo y guarda la tarifa de ENVIA que recauda, al mismo precio", async () => {
    fixture = await createInventoryFixture();
    respond([rate(2002, "ENVIA", 18074, true, 8391), rate(2003, "COORDINADORA", 25781, true, 6116)], [rate(1001, "ENVIA", 16500, false)]);

    // La tienda manda el idRate de SU cotización (con recaudo), que ya no existe.
    const response = await checkout(checkoutBody(fixture, PaymentMethod.COD, { idRate: 999, carrierName: "ENVIA", cost: 18074, isCOD: true }));
    expect(response.status).toBe(200);

    expect(envioclick.quoteShipment).toHaveBeenCalledWith(expect.objectContaining({ codValue: 10000, codPaymentMethod: "cash" }));
    await expect(savedShipping(response)).resolves.toEqual({ envioClickIdRate: 2002, carrierName: "ENVIA", isCOD: true, cost: 18074 });
  });

  it("contra entrega y la transportadora elegida no recauda: 409 con solo las que sí recaudan, sin pedido", async () => {
    fixture = await createInventoryFixture();
    respond([rate(2003, "COORDINADORA", 25781, true, 6116)], [rate(1001, "ENVIA", 16500, false)]);

    const response = await checkout(checkoutBody(fixture, PaymentMethod.COD, { idRate: 999, carrierName: "ENVIA", cost: 16500, isCOD: true }));
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; details: { code: string; alternatives: { carrier: string; isCOD: boolean }[] } };
    expect(body.error).toBe("La transportadora que elegiste no recibe pago contra entrega en tu ciudad. Elige otra que sí lo haga o paga en línea.");
    expect(body.details.code).toBe("SHIPPING_RATE_UNAVAILABLE");
    expect(body.details.alternatives.map(({ carrier, isCOD }) => ({ carrier, isCOD }))).toEqual([{ carrier: "COORDINADORA", isCOD: true }]);
    await expect(testPrisma.order.count({ where: { storeId: fixture.store.id } })).resolves.toBe(0);
  });

  it("transferencia: igual que antes, cotiza sin recaudo y guarda la tarifa prepagada", async () => {
    fixture = await createInventoryFixture();
    respond([rate(2002, "ENVIA", 18074, true, 8391)], [rate(1001, "ENVIA", 16500, false)]);

    const response = await checkout(checkoutBody(fixture, PaymentMethod.BankTransfer, { idRate: 999, carrierName: "ENVIA", cost: 16500, isCOD: false }));
    expect(response.status).toBe(200);

    expect(envioclick.quoteShipment.mock.calls[0][0]).not.toHaveProperty("codValue");
    await expect(savedShipping(response)).resolves.toEqual({ envioClickIdRate: 1001, carrierName: "ENVIA", isCOD: false, cost: 16500 });
  });

  it("la casilla de avisos por WhatsApp queda en el pedido con hora y versión; sin casilla, nada", async () => {
    fixture = await createInventoryFixture();
    respond([], [rate(1001, "ENVIA", 16500, false)]);

    const marked = await checkout({ ...checkoutBody(fixture, PaymentMethod.BankTransfer, { idRate: 999, carrierName: "ENVIA", cost: 16500, isCOD: false }), whatsappOptIn: { version: "2026-10-26" } });
    expect(marked.status).toBe(200);
    const markedId = ((await marked.json()) as { id?: string; order?: { id: string } }).id;
    await expect(
      testPrisma.order.findFirstOrThrow({ where: { storeId: fixture.store.id, ...(markedId ? { id: markedId } : {}) }, select: { whatsappOptInAt: true, whatsappOptInVersion: true, whatsappOptInSource: true, whatsappOptInBy: true } }),
    ).resolves.toMatchObject({ whatsappOptInAt: expect.any(Date), whatsappOptInVersion: "2026-10-26", whatsappOptInSource: "CHECKOUT", whatsappOptInBy: null });

    const unmarked = await checkout(checkoutBody(fixture, PaymentMethod.BankTransfer, { idRate: 999, carrierName: "ENVIA", cost: 16500, isCOD: false }));
    const unmarkedId = ((await unmarked.json()) as { id?: string; order?: { id: string } }).id ?? "";
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: unmarkedId }, select: { whatsappOptInAt: true } })).resolves.toEqual({ whatsappOptInAt: null });
  });
});
