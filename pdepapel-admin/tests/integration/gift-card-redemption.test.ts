import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { GiftCardMovementType, GiftCardStatus, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { generateGiftCardCode, giftCardCodeLast4, hashGiftCardCode, normalizeGiftCardCode } from "@/lib/gift-card-codes";
import { GIFT_CARD_HOLD_DAYS, getAmountDue, releaseExpiredGiftCardHolds, sumGiftCardLedger } from "@/lib/gift-cards";

/**
 * Redención contra MySQL: la tarjeta cubre parte o todo un pedido, dos
 * compras a la vez no se reparten un saldo que no existe, cancelar
 * devuelve lo usado, la compra que emitió una tarjeta usada no se cancela,
 * y el job libera reservas viejas sin romper nada.
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
vi.mock("@/lib/shipping-helpers", async (importOriginal) => ({ ...(await importOriginal<object>()), createGuideForOrder: vi.fn().mockResolvedValue({ data: { idOrder: 1, tracker: "T" } }) }));
vi.mock("@/lib/bold", () => ({ generateBoldCheckoutData: (order: { id: string }) => ({ orderId: order.id, integritySignature: "sig" }) }));
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

const customer = { fullName: "Luisa Sánchez", phone: "+573009999999", email: "luisa@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000" };

/** Una tarjeta ya emitida, como la deja el pago de su compra. */
async function issueCard(storeId: string, amount: number) {
  const code = generateGiftCardCode();
  const canonical = normalizeGiftCardCode(code) as string;
  const purchase = await testPrisma.order.create({
    data: { storeId, orderNumber: `ORD-GC-${randomUUID().slice(0, 8)}`, status: OrderStatus.PAID, paidAt: new Date(), type: OrderType.GIFT_CARD, ...customer, subtotal: amount, total: amount },
  });
  const card = await testPrisma.giftCard.create({
    data: { storeId, codeHash: hashGiftCardCode(canonical), codeLast4: giftCardCodeLast4(canonical), initialAmount: amount, balance: amount, purchaseOrderId: purchase.id, buyerEmail: customer.email },
  });
  await testPrisma.giftCardMovement.create({ data: { storeId, giftCardId: card.id, orderId: purchase.id, type: GiftCardMovementType.ISSUED, amount, balanceAfter: amount, idempotencyKey: `issue:${purchase.id}` } });
  return { card, code, purchase };
}

const checkoutBody = (f: InventoryFixture, extra: Record<string, unknown> = {}) => ({
  ...customer,
  guestId: `guest-${randomUUID()}`,
  orderItems: [{ productId: f.component.id, quantity: 2 }],
  payment: { method: PaymentMethod.BankTransfer },
  shipping: { provider: "CUSTOM", carrierName: "Mensajería Medellín", courier: "Mensajería", cost: 5000 },
  subtotal: 20000,
  total: 25000,
  ...extra,
});

describe("gift card redemption with MySQL", () => {
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
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const checkout = async (f: InventoryFixture, extra: Record<string, unknown> = {}) => {
    const { POST } = await import("@/app/api/[storeId]/checkout/route");
    return POST(json("POST", checkoutBody(f, extra)), { params: { storeId: f.store.id } });
  };

  it("holds part of the balance, keeps total intact, and redeems when the transfer is marked paid", async () => {
    fixture = await createInventoryFixture();
    const { card, code } = await issueCard(fixture.store.id, 10000);

    const response = await checkout(fixture, { giftCardCode: code });
    expect(response.status).toBe(200);
    const order = await response.json();
    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
    expect(stored).toMatchObject({ status: OrderStatus.PENDING, total: 25000, giftCardId: card.id, giftCardAmount: 10000 });
    expect(stored.payment?.method).toBe(PaymentMethod.BankTransfer);
    expect(getAmountDue(stored)).toBe(15000);
    expect((await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance).toBe(0);

    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const paid = await PATCH(json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" } }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(paid.status).toBe(200);
    const movements = await testPrisma.giftCardMovement.findMany({ where: { giftCardId: card.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.amount, m.balanceAfter])).toEqual([[GiftCardMovementType.ISSUED, 10000, 10000], [GiftCardMovementType.HELD, -10000, 0], [GiftCardMovementType.REDEEMED, 0, 0]]);
    expect(await sumGiftCardLedger(testPrisma, card.id)).toBe(0);
    // Repetir el pago (webhook duplicado) no escribe nada más.
    expect((await testPrisma.giftCardMovement.count({ where: { giftCardId: card.id } }))).toBe(3);
  });

  it("covers the whole order: born PAID with method GiftCard, stock moved, no gateway", async () => {
    fixture = await createInventoryFixture();
    const before = (await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).stock;
    const { card, code } = await issueCard(fixture.store.id, 60000);

    const response = await checkout(fixture, { giftCardCode: code, payment: { method: PaymentMethod.Bold } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("boldData");
    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: body.id }, include: { payment: true, shipping: true } });
    expect(stored).toMatchObject({ status: OrderStatus.PAID, total: 25000, giftCardAmount: 25000 });
    expect(stored.paidAt).not.toBeNull();
    expect(stored.payment?.method).toBe(PaymentMethod.GiftCard);
    expect(stored.shipping?.status).toBe("Preparing");
    const after = (await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).stock;
    expect(before - after).toBe(2);
    const movements = await testPrisma.giftCardMovement.findMany({ where: { giftCardId: card.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.amount])).toEqual([[GiftCardMovementType.ISSUED, 60000], [GiftCardMovementType.HELD, -25000], [GiftCardMovementType.REDEEMED, 0]]);
    const reloaded = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(reloaded.balance).toBe(35000);
    expect(await sumGiftCardLedger(testPrisma, card.id)).toBe(35000);
  });

  it("covers only what it has and leaves the rest to the gateway with the right amount", async () => {
    fixture = await createInventoryFixture();
    const { card, code } = await issueCard(fixture.store.id, 10000);

    const response = await checkout(fixture, { giftCardCode: code, payment: { method: PaymentMethod.Bold } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.boldData).toBeDefined();
    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: body.order.id } });
    expect(stored).toMatchObject({ status: OrderStatus.PENDING, total: 25000, giftCardAmount: 10000 });
    expect(getAmountDue(stored)).toBe(15000);
    expect((await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance).toBe(0);
  });

  it("does not let two simultaneous checkouts share a balance that covers only one", async () => {
    fixture = await createInventoryFixture();
    const { card, code } = await issueCard(fixture.store.id, 25000);

    const [a, b] = await Promise.all([checkout(fixture, { giftCardCode: code }), checkout(fixture, { giftCardCode: code, guestId: `guest-${randomUUID()}` })]);
    const statuses = [a.status, b.status].sort();
    // Uno gana el bloqueo; el otro ve la tarjeta sin saldo (409) o se crea sin cubrir nada.
    const bodies = await Promise.all([a.json(), b.json()]);
    const covered = bodies.filter((x) => x?.giftCardAmount === 25000 || x?.order?.giftCardAmount === 25000);
    expect(covered.length).toBeLessThanOrEqual(1);
    const reloaded = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(reloaded.balance).toBeGreaterThanOrEqual(0);
    expect(await sumGiftCardLedger(testPrisma, card.id)).toBe(reloaded.balance);
    expect(statuses[0]).toBeLessThanOrEqual(409);
  });

  it("reverses a paid redemption when the order is cancelled, and releases an unpaid hold", async () => {
    fixture = await createInventoryFixture();
    const { card, code } = await issueCard(fixture.store.id, 10000);
    const paid = await (await checkout(fixture, { giftCardCode: code })).json();
    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    // Marcar pagada la transferencia: la reserva pasa a consumo.
    const markPaid = await PATCH(json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" } }), { params: { storeId: fixture.store.id, orderId: paid.id } });
    expect(markPaid.status).toBe(200);
    expect((await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance).toBe(0);

    const cancel = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PAID }), { params: { storeId: fixture.store.id, orderId: paid.id } });
    expect(cancel.status).toBe(200);
    const afterCancel = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id }, include: { movements: { orderBy: { createdAt: "asc" } } } });
    expect(afterCancel.balance).toBe(10000);
    expect(afterCancel.movements.map((m) => m.type)).toEqual([GiftCardMovementType.ISSUED, GiftCardMovementType.HELD, GiftCardMovementType.REDEEMED, GiftCardMovementType.REVERSED]);
    expect(await sumGiftCardLedger(testPrisma, card.id)).toBe(10000);

    // Segunda compra, cancelada sin pagar: solo se libera la reserva.
    const pending = await (await checkout(fixture, { giftCardCode: code, guestId: `guest-${randomUUID()}` })).json();
    const cancelPending = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PENDING }), { params: { storeId: fixture.store.id, orderId: pending.id } });
    expect(cancelPending.status).toBe(200);
    const final = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id }, include: { movements: { where: { orderId: pending.id }, orderBy: { createdAt: "asc" } } } });
    expect(final.balance).toBe(10000);
    expect(final.movements.map((m) => m.type)).toEqual([GiftCardMovementType.HELD, GiftCardMovementType.RELEASED]);
  });

  it("refuses to cancel the purchase of a card that was already used, and voids an unused one", async () => {
    fixture = await createInventoryFixture();
    const used = await issueCard(fixture.store.id, 60000);
    await (await checkout(fixture, { giftCardCode: used.code })).json();
    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const refused = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PAID }), { params: { storeId: fixture.store.id, orderId: used.purchase.id } });
    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toMatchObject({ error: "La tarjeta ya se usó por 25.000: reembolsa la diferencia por fuera del sistema." });
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: used.purchase.id } })).status).toBe(OrderStatus.PAID);

    const untouched = await issueCard(fixture.store.id, 50000);
    const voided = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PAID }), { params: { storeId: fixture.store.id, orderId: untouched.purchase.id } });
    expect(voided.status).toBe(200);
    const card = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: untouched.card.id } });
    expect(card).toMatchObject({ status: GiftCardStatus.VOID, balance: 0 });

    // Eliminar un pedido que emitió una tarjeta no se permite: se cancela.
    const { DELETE } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const deleted = await DELETE(json("DELETE", {}), { params: { storeId: fixture.store.id, orderId: untouched.purchase.id } });
    expect(deleted.status).toBe(409);
  });

  it("releases stale holds from the scheduled job and re-holds when the order is paid late", async () => {
    fixture = await createInventoryFixture();
    const { card, code } = await issueCard(fixture.store.id, 20000);
    const stale = await (await checkout(fixture, { giftCardCode: code })).json();
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(OrderStatus.PENDING);
    await testPrisma.order.update({ where: { id: stale.id }, data: { createdAt: new Date(Date.now() - (GIFT_CARD_HOLD_DAYS + 1) * 24 * 60 * 60 * 1000) } });
    // Mientras la reserva vive, la tarjeta no tiene saldo para nadie más.
    expect((await checkout(fixture, { giftCardCode: code, guestId: `guest-${randomUUID()}` })).status).toBe(409);

    const result = await releaseExpiredGiftCardHolds(testPrisma, { storeId: fixture.store.id });
    expect(result).toMatchObject({ released: 1, failed: [] });
    const afterRelease = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(afterRelease.balance).toBe(20000);
    expect(await sumGiftCardLedger(testPrisma, card.id)).toBe(afterRelease.balance);
    // Correrlo otra vez no hace nada.
    expect(await releaseExpiredGiftCardHolds(testPrisma, { storeId: fixture.store.id })).toMatchObject({ released: 0 });

    // El pedido viejo se paga tarde: se reserva de nuevo y se consume.
    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const late = await PATCH(json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-9999" } }), { params: { storeId: fixture.store.id, orderId: stale.id } });
    expect(late.status).toBe(200);
    const final = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: card.id }, include: { movements: { where: { orderId: stale.id }, orderBy: { createdAt: "asc" } } } });
    expect(final.balance).toBe(0);
    expect(final.movements.map((m) => m.type)).toEqual([GiftCardMovementType.HELD, GiftCardMovementType.RELEASED, GiftCardMovementType.HELD, GiftCardMovementType.REDEEMED]);
  });
});
