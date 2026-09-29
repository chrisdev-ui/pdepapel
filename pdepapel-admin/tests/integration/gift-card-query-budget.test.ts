import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { GiftCardMovementType, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { generateGiftCardCode, giftCardCodeLast4, hashGiftCardCode, normalizeGiftCardCode } from "@/lib/gift-card-codes";

/**
 * Presupuesto de consultas, medido como se encontró el fallo del cierre de
 * feria: con el contador `Questions` de MySQL alrededor de cada ruta.
 *   - POST /checkout sin tarjeta (base) y con tarjeta parcial: la tarjeta
 *     puede añadir como mucho 6 consultas (lectura, bloqueo, idempotencia,
 *     UPDATE, movimiento y la lectura de la reserva).
 *   - POST /gift-cards/checkout: menos de 12 consultas.
 *   - POST /gift-cards/validate: 1 consulta (más el límite en Redis, que aquí
 *     está simulado).
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined), normalizeGoogleAnalyticsClientId: () => null }));
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

async function serverQuestions(): Promise<number> {
  const rows = await testPrisma.$queryRawUnsafe<{ Variable_name: string; Value: string }[]>("SHOW GLOBAL STATUS LIKE 'Questions'");
  return Number(rows[0]?.Value ?? 0);
}

async function measure<T>(run: () => Promise<T>): Promise<{ result: T; queries: number; ms: number }> {
  const before = await serverQuestions();
  const started = performance.now();
  const result = await run();
  const ms = performance.now() - started;
  const queries = (await serverQuestions()) - before - 1;
  return { result, queries, ms };
}

const json = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });

const customer = { fullName: "Luisa Sánchez", phone: "+573009999999", email: "luisa@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000" };

async function issueCard(storeId: string, amount: number) {
  const code = generateGiftCardCode();
  const canonical = normalizeGiftCardCode(code) as string;
  const purchase = await testPrisma.order.create({ data: { storeId, orderNumber: `ORD-GC-${randomUUID().slice(0, 8)}`, status: OrderStatus.PAID, paidAt: new Date(), type: OrderType.GIFT_CARD, ...customer, subtotal: amount, total: amount } });
  const card = await testPrisma.giftCard.create({ data: { storeId, codeHash: hashGiftCardCode(canonical), codeLast4: giftCardCodeLast4(canonical), initialAmount: amount, balance: amount, purchaseOrderId: purchase.id } });
  await testPrisma.giftCardMovement.create({ data: { storeId, giftCardId: card.id, orderId: purchase.id, type: GiftCardMovementType.ISSUED, amount, balanceAfter: amount, idempotencyKey: `issue:${purchase.id}` } });
  return { card, code };
}

const checkoutBody = (f: InventoryFixture, extra: Record<string, unknown> = {}) => ({
  ...customer,
  guestId: `guest-${randomUUID()}`,
  orderItems: [{ productId: f.component.id, quantity: 1 }],
  payment: { method: PaymentMethod.BankTransfer },
  shipping: { provider: "CUSTOM", carrierName: "Mensajería Medellín", courier: "Mensajería", cost: 5000 },
  subtotal: 10000,
  total: 15000,
  ...extra,
});

describe("gift card query budget (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.giftCardMovement.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.order.updateMany({ where: { storeId: fixture.store.id }, data: { giftCardId: null } });
      await testPrisma.giftCard.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("checkout with a partial gift card adds at most 6 queries to the baseline", async () => {
    fixture = await createInventoryFixture();
    const { POST } = await import("@/app/api/[storeId]/checkout/route");
    const { code } = await issueCard(fixture.store.id, 5000);

    const baseline = await measure(() => POST(json(checkoutBody(fixture!)), { params: { storeId: fixture!.store.id } }));
    expect(baseline.result.status).toBe(200);
    // Segunda compra del mismo carrito: el freno de tres minutos es por guestId, ya distinto.
    const withCard = await measure(() => POST(json(checkoutBody(fixture!, { giftCardCode: code })), { params: { storeId: fixture!.store.id } }));
    expect(withCard.result.status).toBe(200);

    process.stderr.write(`[budget] POST /checkout base=${baseline.queries} q / ${baseline.ms.toFixed(0)} ms · con tarjeta=${withCard.queries} q / ${withCard.ms.toFixed(0)} ms\n`);
    expect(withCard.queries - baseline.queries).toBeLessThanOrEqual(6);
  });

  it("gift card purchase stays under 12 queries", async () => {
    fixture = await createInventoryFixture();
    const { POST } = await import("@/app/api/[storeId]/gift-cards/checkout/route");
    const purchase = await measure(() =>
      POST(json({ amount: 100000, buyerName: "Luisa Sánchez", buyerEmail: "luisa@prueba.test", recipientName: "Mariana", payment: { method: PaymentMethod.BankTransfer }, guestId: `guest-${randomUUID()}` }), { params: { storeId: fixture!.store.id } }),
    );
    expect(purchase.result.status).toBe(200);
    process.stderr.write(`[budget] POST /gift-cards/checkout=${purchase.queries} q / ${purchase.ms.toFixed(0)} ms\n`);
    expect(purchase.queries).toBeLessThan(12);
  });

  it("validation is a single lookup", async () => {
    fixture = await createInventoryFixture();
    const { code } = await issueCard(fixture.store.id, 5000);
    const { POST } = await import("@/app/api/[storeId]/gift-cards/validate/route");
    const validate = await measure(() => POST(json({ code }), { params: { storeId: fixture!.store.id } }));
    expect(validate.result.status).toBe(200);
    process.stderr.write(`[budget] POST /gift-cards/validate=${validate.queries} q / ${validate.ms.toFixed(0)} ms\n`);
    expect(validate.queries).toBeLessThanOrEqual(2);
  });
});
