import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Compra de una tarjeta de regalo: un pedido GIFT_CARD con una línea manual,
 * sin envío, que sale a la misma pasarela que el checkout. La tarjeta NO se
 * emite aquí (solo al pagar), así que esta ruta nunca toca GiftCard.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  orderCreate: vi.fn(),
  denominations: vi.fn(),
  getLastOrderTimestamp: vi.fn(),
  generateBoldCheckoutData: vi.fn(),
  generateWompiPayment: vi.fn(),
  sendOrderEmail: vi.fn(),
  giftCardCreate: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      typeof fn === "function"
        ? fn({ order: { create: mocks.orderCreate }, giftCard: { create: mocks.giftCardCreate } })
        : fn,
    giftCardDenomination: { findMany: mocks.denominations },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  currencyFormatter: (value: number) => `$ ${value}`,
  generateOrderNumber: () => "ORD-GC-1",
  generateWompiPayment: mocks.generateWompiPayment,
  getLastOrderTimestamp: mocks.getLastOrderTimestamp,
}));
vi.mock("@/lib/bold", () => ({ generateBoldCheckoutData: mocks.generateBoldCheckoutData }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));

import { POST } from "@/app/api/[storeId]/gift-cards/checkout/route";

const storeId = "store-1";
const order = { id: "order-gc", orderNumber: "ORD-GC-1", total: 100000, orderItems: [], coupon: null, fullName: "Luisa Sánchez" };

function request(overrides: Record<string, unknown> = {}) {
  return new Request("https://admin.example.com/api/store-1/gift-cards/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      amount: 100000,
      buyerName: "Luisa Sánchez",
      buyerEmail: "Luisa@Example.com",
      recipientName: "Mariana López",
      recipientEmail: "mariana@example.com",
      message: "¡Feliz cumpleaños!",
      payment: { method: PaymentMethod.Bold },
      guestId: "guest-1",
      ...overrides,
    }),
  });
}

describe("POST /api/[storeId]/gift-cards/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.denominations.mockResolvedValue([]);
    mocks.getLastOrderTimestamp.mockResolvedValue(null);
    mocks.orderCreate.mockResolvedValue(order);
    mocks.generateBoldCheckoutData.mockReturnValue({ orderId: "order-gc", integritySignature: "sig" });
    mocks.generateWompiPayment.mockResolvedValue("https://checkout.wompi.co/p/x");
    mocks.sendOrderEmail.mockResolvedValue(undefined);
  });

  it("creates a GIFT_CARD order with one manual line, no shipping, and hands off to Bold", async () => {
    const response = await POST(request(), { params: { storeId } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      order,
      boldData: { orderId: "order-gc", integritySignature: "sig" },
    });
    const data = mocks.orderCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      storeId,
      type: OrderType.GIFT_CARD,
      status: OrderStatus.PENDING,
      fullName: "Luisa Sánchez",
      email: "luisa@example.com",
      guestId: "guest-1",
      userId: null,
      isGift: true,
      giftRecipientName: "Mariana López",
      giftRecipientEmail: "mariana@example.com",
      giftMessage: "¡Feliz cumpleaños!",
      subtotal: 100000,
      total: 100000,
      payment: { create: { storeId, method: PaymentMethod.Bold } },
    });
    expect(data).not.toHaveProperty("shipping");
    expect(data.orderItems.create).toEqual([
      { name: "Tarjeta de regalo $ 100000", quantity: 1, price: 100000, isCustom: true, productId: null },
    ]);
    // La tarjeta no existe hasta que el pago se confirma.
    expect(mocks.giftCardCreate).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(expect.objectContaining({ id: "order-gc" }), OrderStatus.PENDING);
  });

  it("keeps the message when the buyer will hand the card over herself", async () => {
    await POST(request({ recipientName: "", recipientEmail: "" }), { params: { storeId } });
    const data = mocks.orderCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ isGift: false, giftRecipientName: null, giftRecipientEmail: null, giftMessage: "¡Feliz cumpleaños!" });
  });

  it("returns the order for a bank transfer and a URL for Wompi", async () => {
    const transfer = await POST(request({ payment: { method: PaymentMethod.BankTransfer } }), { params: { storeId } });
    await expect(transfer.json()).resolves.toEqual(order);

    const wompi = await POST(request({ payment: { method: PaymentMethod.Wompi } }), { params: { storeId } });
    await expect(wompi.json()).resolves.toEqual({ url: "https://checkout.wompi.co/p/x" });
  });

  it("refuses values that are not on sale, cash on delivery, and paying a card with a card", async () => {
    const bad = await POST(request({ amount: 75000 }), { params: { storeId } });
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toMatchObject({ error: expect.stringContaining("no está a la venta") });

    const cod = await POST(request({ payment: { method: PaymentMethod.COD } }), { params: { storeId } });
    expect(cod.status).toBe(400);
    const card = await POST(request({ payment: { method: PaymentMethod.GiftCard } }), { params: { storeId } });
    expect(card.status).toBe(400);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("honours the configured denominations", async () => {
    mocks.denominations.mockResolvedValue([{ amount: 75000, isActive: true }, { amount: 100000, isActive: false }]);
    const ok = await POST(request({ amount: 75000 }), { params: { storeId } });
    expect(ok.status).toBe(200);
    const off = await POST(request({ amount: 100000 }), { params: { storeId } });
    expect(off.status).toBe(400);
  });

  it("applies the three-minute throttle like the checkout", async () => {
    mocks.getLastOrderTimestamp.mockResolvedValue(new Date());
    const response = await POST(request(), { params: { storeId } });
    expect(response.status).toBe(429);
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("uses the session user over anything in the body", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    await POST(request({ userId: "someone-else", guestId: "guest-1" }), { params: { storeId } });
    expect(mocks.orderCreate.mock.calls[0][0].data).toMatchObject({ userId: "user-1", guestId: null });
  });

  it("rejects an invalid buyer email before creating anything", async () => {
    const response = await POST(request({ buyerEmail: "nope" }), { params: { storeId } });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Escribe un correo válido para el recibo" });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });
});
