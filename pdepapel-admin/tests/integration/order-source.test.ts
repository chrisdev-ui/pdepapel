import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderType, PaymentMethod } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Origen del pedido (`Order.source`) en cada ruta pública de creación, contra
 * MySQL: la tienda deja STORE y la dueña PANEL según la sesión, nunca según el
 * cuerpo. Y la ruta de transferencia/contra entrega (`/orders`) guarda la
 * sesión de GA4 y el consentimiento igual que `/checkout`, solo si la tienda
 * los manda.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", async (importOriginal) => ({ ...(await importOriginal<object>()), createGuideForOrder: vi.fn() }));
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

const customer = { fullName: "Luisa Sánchez", phone: "+573009999999", email: "luisa@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000" };
const analytics = { analyticsClientId: "1234567890.1700000000", analyticsSessionId: "1700000123", analyticsConsent: true };

const storeBody = (f: InventoryFixture, extra: Record<string, unknown> = {}) => ({
  ...customer,
  guestId: `guest_${randomUUID()}`,
  type: OrderType.STANDARD,
  orderItems: [{ productId: f.component.id, quantity: 1 }],
  payment: { method: PaymentMethod.BankTransfer },
  shipping: { provider: "CUSTOM", carrierName: "Mensajería Medellín", courier: "Mensajería", cost: 5000 },
  subtotal: 10000,
  total: 15000,
  ...extra,
});

const stored = (id: string) =>
  testPrisma.order.findUniqueOrThrow({
    where: { id },
    select: { source: true, analyticsClientId: true, analyticsSessionId: true, analyticsConsent: true },
  });

describe("origen del pedido (MySQL)", () => {
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

  const createOrder = async (route: "orders" | "checkout", body: Record<string, unknown>) => {
    const { POST } = route === "orders" ? await import("@/app/api/[storeId]/orders/route") : await import("@/app/api/[storeId]/checkout/route");
    const response = await POST(json(body), { params: { storeId: fixture!.store.id } });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { id?: string; orderId?: string; order?: { id: string } };
    return data.id ?? data.orderId ?? data.order!.id;
  };

  it("/orders desde la tienda (transferencia): STORE, con la sesión de GA4 y el consentimiento que mandó", async () => {
    fixture = await createInventoryFixture();
    const id = await createOrder("orders", storeBody(fixture, analytics));
    await expect(stored(id)).resolves.toEqual({ source: OrderSource.STORE, ...analytics });
  });

  it("/orders desde la tienda sin datos de analítica: no se inventa nada", async () => {
    fixture = await createInventoryFixture();
    const id = await createOrder("orders", storeBody(fixture));
    await expect(stored(id)).resolves.toEqual({ source: OrderSource.STORE, analyticsClientId: null, analyticsSessionId: null, analyticsConsent: null });
  });

  it("/orders con «no» al consentimiento: guarda el no y nada más", async () => {
    fixture = await createInventoryFixture();
    const id = await createOrder("orders", storeBody(fixture, { analyticsConsent: false }));
    await expect(stored(id)).resolves.toEqual({ source: OrderSource.STORE, analyticsClientId: null, analyticsSessionId: null, analyticsConsent: false });
  });

  it("/orders desde el panel: PANEL y nada de analítica de la dueña, aunque el cuerpo diga otra cosa", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const id = await createOrder("orders", storeBody(fixture, { ...analytics, source: OrderSource.STORE }));
    await expect(stored(id)).resolves.toEqual({ source: OrderSource.PANEL, analyticsClientId: null, analyticsSessionId: null, analyticsConsent: null });
  });

  it("una clienta no puede marcar su pedido como del panel", async () => {
    fixture = await createInventoryFixture();
    const id = await createOrder("orders", storeBody(fixture, { source: OrderSource.PANEL }));
    await expect(stored(id)).resolves.toMatchObject({ source: OrderSource.STORE });
  });

  it("/checkout desde la tienda: STORE; con sesión de la dueña: PANEL", async () => {
    fixture = await createInventoryFixture();
    const fromStore = await createOrder("checkout", storeBody(fixture, analytics));
    await expect(stored(fromStore)).resolves.toEqual({ source: OrderSource.STORE, ...analytics });
    session.userId = fixture.store.userId;
    const fromOwner = await createOrder("checkout", storeBody(fixture, { ...analytics, guestId: null }));
    await expect(stored(fromOwner)).resolves.toEqual({ source: OrderSource.PANEL, analyticsClientId: null, analyticsSessionId: null, analyticsConsent: null });
  });

  it("tarjeta de regalo desde la tienda: STORE (es un medio de pago, no un origen); de la dueña: PANEL", async () => {
    fixture = await createInventoryFixture();
    const { POST } = await import("@/app/api/[storeId]/gift-cards/checkout/route");
    const buy = async () => {
      const response = await POST(
        json({ amount: 50000, buyerName: "Luisa Sánchez", buyerEmail: "luisa@prueba.test", recipientName: "Mariana", payment: { method: PaymentMethod.BankTransfer }, guestId: session.userId ? undefined : `guest-${randomUUID()}` }),
        { params: { storeId: fixture!.store.id } },
      );
      expect(response.status).toBe(200);
      const data = (await response.json()) as { orderId?: string; id?: string; order?: { id: string } };
      return data.orderId ?? data.id ?? data.order!.id;
    };
    const fromStore = await buy();
    await expect(stored(fromStore)).resolves.toMatchObject({ source: OrderSource.STORE });
    session.userId = fixture.store.userId;
    const fromOwner = await buy();
    await expect(stored(fromOwner)).resolves.toMatchObject({ source: OrderSource.PANEL });
  });
});
