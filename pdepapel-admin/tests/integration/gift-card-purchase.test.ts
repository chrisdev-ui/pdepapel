import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { GiftCardMovementType, GiftCardStatus, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { getAmountDue, issueGiftCardForOrder, reissueGiftCard, sumGiftCardLedger } from "@/lib/gift-cards";
import { parseGiftCardCode } from "@/lib/gift-card-codes";
import { getOrderQueue } from "@/lib/order-queues";

/**
 * Compra y emisión de una tarjeta de regalo contra MySQL: el pedido nace por
 * la ruta de compra, se marca pagado por el panel (transferencia), la
 * tarjeta se emite una sola vez aunque se repita, el libro cuadra con el
 * saldo, el código sale por correo (simulado) y la reemisión invalida el
 * código anterior en la misma transacción.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const delivery = vi.hoisted(() => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/gift-card-delivery", () => delivery);
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn() }));
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

const purchase = (extra: Record<string, unknown> = {}) => ({
  amount: 100000,
  buyerName: "Luisa Sánchez",
  buyerEmail: "luisa@prueba.test",
  recipientName: "Mariana López",
  recipientEmail: "mariana@prueba.test",
  message: "¡Feliz cumpleaños!",
  payment: { method: PaymentMethod.BankTransfer },
  guestId: `guest-${Date.now()}`,
  ...extra,
});

describe("gift card purchase and issuance with MySQL", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.giftCardMovement.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.giftCard.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.giftCardDenomination.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
    delivery.deliverGiftCard.mockClear();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** Una compra anterior pagada con el mismo correo: la tarjeta no espera revisión. */
  const returningCustomer = (storeId: string) =>
    testPrisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-PREVIA-${Date.now()}`,
        fullName: "Luisa Sánchez",
        email: "luisa@prueba.test",
        phone: "",
        address: "",
        status: OrderStatus.PAID,
        type: OrderType.CUSTOM,
        paidAt: new Date(),
        subtotal: 1000,
        total: 1000,
      },
    });

  const markPaid = async (storeId: string, orderId: string) => {
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    return PATCH(
      json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" } }),
      { params: { storeId, orderId } },
    );
  };

  const buy = async (storeId: string, extra: Record<string, unknown> = {}) => {
    const { POST } = await import("@/app/api/[storeId]/gift-cards/checkout/route");
    const response = await POST(json("POST", purchase(extra)), { params: { storeId } });
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; orderNumber: string; status: OrderStatus; type: OrderType };
  };

  it("creates a pending GIFT_CARD order with no shipping and no card yet", async () => {
    fixture = await createInventoryFixture();
    const order = await buy(fixture.store.id);

    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { orderItems: true, shipping: true, payment: true, giftCardPurchase: true } });
    expect(stored).toMatchObject({ type: OrderType.GIFT_CARD, status: OrderStatus.PENDING, total: 100000, email: "luisa@prueba.test", giftRecipientName: "Mariana López" });
    expect(stored.shipping).toBeNull();
    expect(stored.giftCardPurchase).toBeNull();
    expect(stored.orderItems).toHaveLength(1);
    expect(stored.orderItems[0]).toMatchObject({ isCustom: true, productId: null, price: 100000 });
    expect(stored.payment?.method).toBe(PaymentMethod.BankTransfer);
    expect(getOrderQueue(stored as never)).toBe("verify");
    expect(getAmountDue(stored)).toBe(100000);
  });

  it("issues the card once when the panel marks the transfer paid, mails the code, and the ledger matches the balance", async () => {
    fixture = await createInventoryFixture();
    await returningCustomer(fixture.store.id);
    const order = await buy(fixture.store.id);
    session.userId = fixture.store.userId;

    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const paid = await PATCH(
      json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" } }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    expect(paid.status).toBe(200);

    const card = await testPrisma.giftCard.findUniqueOrThrow({ where: { purchaseOrderId: order.id }, include: { movements: true } });
    expect(card).toMatchObject({ status: GiftCardStatus.ACTIVE, initialAmount: 100000, balance: 100000, buyerEmail: "luisa@prueba.test", recipientName: "Mariana López", recipientEmail: "mariana@prueba.test", message: "¡Feliz cumpleaños!" });
    expect(card.codeHash).toHaveLength(64);
    expect(card.movements).toHaveLength(1);
    expect(card.movements[0]).toMatchObject({ type: GiftCardMovementType.ISSUED, amount: 100000, balanceAfter: 100000, idempotencyKey: `issue:${order.id}` });
    expect(await sumGiftCardLedger(testPrisma, card.id)).toBe(card.balance);

    expect(delivery.deliverGiftCard).toHaveBeenCalledTimes(1);
    const issued = delivery.deliverGiftCard.mock.calls[0][0];
    expect(issued.deliverTo).toBe("mariana@prueba.test");
    expect(parseGiftCardCode(issued.code)?.hash).toBe(card.codeHash);
    expect(parseGiftCardCode(issued.code)?.last4).toBe(card.codeLast4);

    // Un pedido de tarjeta pagado no tiene nada que despachar y no abre envío.
    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { shipping: true, payment: true } });
    expect(stored.shipping).toBeNull();
    expect(stored.paidAt).not.toBeNull();
    expect(stored.totalProductCost).toBe(0);
    expect(stored.netProfit).toBe(0);
    expect(getOrderQueue(stored as never)).toBe("completed");

    // Repetir la emisión (webhook duplicado) no crea otra tarjeta ni movimiento.
    const again = await testPrisma.$transaction((tx) => issueGiftCardForOrder(tx, { storeId: fixture!.store.id, orderId: order.id }));
    expect(again?.code).toBeNull();
    expect(await testPrisma.giftCard.count({ where: { storeId: fixture.store.id } })).toBe(1);
    expect(await testPrisma.giftCardMovement.count({ where: { giftCardId: card.id } })).toBe(1);
  });

  it("reissues a fresh code in one transaction and the old one stops matching", async () => {
    fixture = await createInventoryFixture();
    await returningCustomer(fixture.store.id);
    const order = await buy(fixture.store.id, { recipientEmail: "" });
    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    await PATCH(
      json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" } }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    const before = await testPrisma.giftCard.findUniqueOrThrow({ where: { purchaseOrderId: order.id } });
    const firstCode = delivery.deliverGiftCard.mock.calls[0][0].code as string;
    expect(delivery.deliverGiftCard.mock.calls[0][0].deliverTo).toBe("luisa@prueba.test");

    const reissued = await reissueGiftCard(testPrisma, { storeId: fixture.store.id, giftCardId: before.id, createdBy: "owner" });
    const after = await testPrisma.giftCard.findUniqueOrThrow({ where: { id: before.id }, include: { movements: { orderBy: { createdAt: "asc" } } } });
    expect(after.codeHash).not.toBe(before.codeHash);
    expect(after.codeHash).toBe(parseGiftCardCode(reissued.code!)?.hash);
    expect(after.balance).toBe(100000);
    expect(await testPrisma.giftCard.findUnique({ where: { codeHash: parseGiftCardCode(firstCode)!.hash } })).toBeNull();
    expect(after.movements.map((m) => m.type)).toEqual([GiftCardMovementType.ISSUED, GiftCardMovementType.VOIDED, GiftCardMovementType.REISSUED]);
    expect(await sumGiftCardLedger(testPrisma, after.id)).toBe(after.balance);
  });

  it("stays out of the order flows it does not belong to: the welcome benefit rule and the dispatch queue", async () => {
    fixture = await createInventoryFixture();
    const order = await buy(fixture.store.id);
    session.userId = fixture.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    await PATCH(
      json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1234" } }),
      { params: { storeId: fixture.store.id, orderId: order.id } },
    );
    // La regla del beneficio de bienvenida cuenta solo pedidos STANDARD pagados.
    const standardPaid = await testPrisma.order.count({ where: { storeId: fixture.store.id, type: OrderType.STANDARD, status: OrderStatus.PAID } });
    expect(standardPaid).toBe(0);
    // Ningún movimiento de inventario: no hay producto.
    expect(await testPrisma.inventoryMovement.count({ where: { referenceId: order.id } })).toBe(0);
  });

  it("una primera compra de 100.000 queda en revisión al pagarse y solo emite el código cuando la dueña la aprueba", async () => {
    fixture = await createInventoryFixture();
    const order = await buy(fixture.store.id);
    session.userId = fixture.store.userId;
    expect((await markPaid(fixture.store.id, order.id)).status).toBe(200);

    const held = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { giftCardPurchase: true } });
    expect(held.status).toBe(OrderStatus.PAID);
    expect(held.giftCardReview).toBe("PENDING");
    expect(held.giftCardPurchase).toBeNull();
    expect(delivery.deliverGiftCard).not.toHaveBeenCalled();

    const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/gift-card-review/route");
    const approved = await POST(json("POST", { decision: "approve" }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(approved.status).toBe(200);
    const card = await testPrisma.giftCard.findUniqueOrThrow({ where: { purchaseOrderId: order.id } });
    expect(card.balance).toBe(100000);
    expect(delivery.deliverGiftCard).toHaveBeenCalledTimes(1);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).giftCardReview).toBe("APPROVED");

    const twice = await POST(json("POST", { decision: "approve" }), { params: { storeId: fixture.store.id, orderId: order.id } });
    expect(twice.status).toBe(409);
    expect(await testPrisma.giftCard.count({ where: { storeId: fixture.store.id } })).toBe(1);
  });

  it("rechazada no emite nada aunque el webhook o el panel vuelvan a pasar por la emisión", async () => {
    fixture = await createInventoryFixture();
    const order = await buy(fixture.store.id);
    session.userId = fixture.store.userId;
    await markPaid(fixture.store.id, order.id);
    const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/gift-card-review/route");
    expect((await POST(json("POST", { decision: "reject" }), { params: { storeId: fixture.store.id, orderId: order.id } })).status).toBe(200);

    const again = await testPrisma.$transaction((tx) => issueGiftCardForOrder(tx, { storeId: fixture!.store.id, orderId: order.id }));
    expect(again).toBeNull();
    expect(await testPrisma.giftCard.count({ where: { storeId: fixture.store.id } })).toBe(0);
    expect(delivery.deliverGiftCard).not.toHaveBeenCalled();
  });

  it("el filtro de la tienda rechaza el patrón del bot y guarda las señales de un envío rápido", async () => {
    fixture = await createInventoryFixture();
    const { POST } = await import("@/app/api/[storeId]/gift-cards/checkout/route");
    const bot = await POST(json("POST", purchase({ buyerName: "xKqPzLmWvB", buyerPhone: "+57 912 345 6789" })), { params: { storeId: fixture.store.id } });
    expect(bot.status).toBe(400);
    const trap = await POST(json("POST", purchase({ website: "http://spam" })), { params: { storeId: fixture.store.id } });
    expect(trap.status).toBe(400);
    expect(await testPrisma.order.count({ where: { storeId: fixture.store.id } })).toBe(0);

    const fast = await buy(fixture.store.id, { formStartedAt: Date.now() - 7_000, buyerPhone: "300 123 4567" });
    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: fast.id } });
    expect(stored).toMatchObject({ riskScore: 2, riskReasons: "envio-rapido", phone: "+573001234567" });
  });

  it("«Cancelar como fraude/bot» conserva el pedido marcado, no se puede emitir y marca el siguiente con el mismo correo", async () => {
    fixture = await createInventoryFixture();
    const order = await buy(fixture.store.id);
    session.userId = fixture.store.userId;

    const { PATCH } = await import("@/app/api/[storeId]/orders/route");
    const cancelled = await PATCH(json("PATCH", { ids: [order.id], status: OrderStatus.CANCELLED, fraud: true }), { params: { storeId: fixture.store.id } });
    expect(cancelled.status).toBe(200);

    const stored = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe(OrderStatus.CANCELLED);
    expect(stored.riskReasons).toContain("fraude-confirmado");
    expect(stored.riskScore).toBeGreaterThanOrEqual(10);

    const issued = await testPrisma.$transaction((tx) => issueGiftCardForOrder(tx, { storeId: fixture!.store.id, orderId: order.id }));
    expect(issued).toBeNull();

    session.userId = null;
    const next = await buy(fixture.store.id, { guestId: `guest-otro-${Date.now()}` });
    const flagged = await testPrisma.order.findUniqueOrThrow({ where: { id: next.id } });
    expect(flagged.riskReasons).toContain("fraude-previo");
  });
});
