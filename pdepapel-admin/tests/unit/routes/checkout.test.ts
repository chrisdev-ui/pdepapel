import { PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  calculateOrderTotals: vi.fn(),
  checkIfStoreOwner: vi.fn(),
  findCoupon: vi.fn(),
  findOrder: vi.fn(),
  findProducts: vi.fn(),
  findShippingQuotes: vi.fn(),
  generateBoldCheckoutData: vi.fn(),
  generateOrderNumber: vi.fn(),
  getLastOrderTimestamp: vi.fn(),
  getProductsPrices: vi.fn(),
  priceLines: vi.fn(),
  normalizeGoogleAnalyticsClientId: vi.fn(),
  orderCreate: vi.fn(),
  orderFindMany: vi.fn(),
  orderCount: vi.fn(),
  sendOrderEmail: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
  clerkClient: async () => ({ users: { getUser: vi.fn() } }),
}));
/** Cliente de transacción: los mismos mocks que el cliente global. */
const txMock = () => ({
  order: {
    create: mocks.orderCreate,
    findUnique: mocks.findOrder,
    findMany: mocks.orderFindMany,
    count: mocks.orderCount,
  },
  customerAddress: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  coupon: { findFirst: mocks.findCoupon, update: vi.fn(), updateMany: vi.fn() },
});
vi.mock("@/lib/prismadb", () => ({
  default: {
    // El pedido se crea siempre dentro de una transacción: es lo que hace
    // atómico el cupo del cupón.
    $transaction: (fn: (tx: unknown) => unknown) =>
      typeof fn === "function" ? fn(txMock()) : fn,
    coupon: { findFirst: mocks.findCoupon, fields: { maxUses: "maxUses" } },
    order: {
      create: mocks.orderCreate,
      findUnique: mocks.findOrder,
      findMany: mocks.orderFindMany,
      count: mocks.orderCount,
    },
    product: { findMany: mocks.findProducts },
    // Sin preventas activas: estas pruebas cubren la compra normal.
    productPresale: { findMany: vi.fn().mockResolvedValue([]) },
    shippingQuote: { findMany: mocks.findShippingQuotes },
    store: {
      findUnique: vi.fn().mockResolvedValue({ freeShippingThreshold: null }),
    },
  },
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  checkIfStoreOwner: mocks.checkIfStoreOwner,
  currencyFormatter: (value: number) => `$ ${value}`,
  generateOrderNumber: mocks.generateOrderNumber,
  generateWompiPayment: vi.fn(),
  getLastOrderTimestamp: mocks.getLastOrderTimestamp,
  processOrderItemsInBatches: vi.fn(),
}));
vi.mock("@/lib/order-totals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/order-totals")>()),
  calculateOrderTotals: mocks.calculateOrderTotals,
}));
// El checkout resuelve el precio con `priceLines`: precio de lista, mejor
// oferta y escalera por cantidad, el más bajo de los tres. Se dobla entero
// porque además consulta `ProductPriceTier`, que aquí no hay base que responda.
vi.mock("@/lib/product-pricing", () => ({
  priceLines: mocks.priceLines,
}));

vi.mock("@/lib/discount-engine", () => ({
  getProductsPrices: mocks.getProductsPrices,
}));
vi.mock("@/lib/date-utils", () => ({ getColombiaDate: vi.fn() }));
vi.mock("@/constants/shipping", () => ({
  ENVIOCLICK_DEFAULTS: { insurance: false, requestPickup: true },
}));
vi.mock("@/lib/bold", () => ({
  generateBoldCheckoutData: mocks.generateBoldCheckoutData,
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
// La invalidación de caché llega a lib/resend por la alerta de revalidación, y
// Resend exige la clave al cargar: en CI no hay .env, así que se sustituye.
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({
  // El normalizador de sesión es puro: se usa el real.
  normalizeGoogleAnalyticsSessionId: (await importOriginal<typeof import("@/lib/google-analytics")>()).normalizeGoogleAnalyticsSessionId,
  normalizeGoogleAnalyticsClientId: mocks.normalizeGoogleAnalyticsClientId,
}));

import { POST } from "@/app/api/[storeId]/checkout/route";

const storeId = "store-id";
const product = {
  id: "product-id",
  name: "Agenda floral",
  price: 10000,
  stock: 4,
  sku: "AGENDA-001",
  isArchived: false,
  images: [{ url: "https://example.com/agenda.webp", isMain: true }],
  category: { id: "category-id" },
  productGroup: null,
};
const order = {
  id: "order-id",
  orderNumber: "ORD-123",
  total: 15000,
  orderItems: [{ ...product, productId: product.id, quantity: 1 }],
  coupon: null,
};

function createCheckoutRequest(overrides: Record<string, unknown> = {}) {
  return new Request("https://admin.example.com/api/store-id/checkout", {
    body: JSON.stringify({
      fullName: "Ana Gómez",
      phone: "3001234567",
      email: "ana@example.com",
      address: "Calle 10 # 20-30",
      city: "Medellín",
      department: "Antioquia",
      daneCode: "05001",
      guestId: "guest-id",
      orderItems: [{ productId: product.id, quantity: 1 }],
      payment: { method: PaymentMethod.Bold },
      shipping: {
        provider: "CUSTOM",
        carrierName: "Mensajería Medellín",
        courier: "Mensajería",
        cost: 5000,
      },
      subtotal: 10000,
      total: 15000,
      ...overrides,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/[storeId]/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: null, user: null });
    mocks.currentUser.mockResolvedValue(null);
    mocks.checkIfStoreOwner.mockResolvedValue(false);
    mocks.findShippingQuotes.mockResolvedValue([]);
    mocks.findProducts.mockResolvedValue([product]);
    mocks.getLastOrderTimestamp.mockResolvedValue(null);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        [
          product.id,
          {
            price: 10000,
            originalPrice: 10000,
            discount: 0,
            offerLabel: null,
            matchedOfferId: null,
          },
        ],
      ]),
    );
    mocks.priceLines.mockResolvedValue(
      new Map([
        [
          product.id,
          {
            productId: product.id,
            quantity: 1,
            unitPrice: 10000,
            originalPrice: 10000,
            source: "base",
            offerLabel: null,
            tierMinQuantity: null,
            lineTotal: 10000,
          },
        ],
      ]),
    );
    mocks.calculateOrderTotals.mockReturnValue({
      subtotal: 10000,
      discount: 0,
      couponDiscount: 0,
      total: 15000,
    });
    mocks.generateOrderNumber.mockReturnValue("ORD-123");
    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue(null);
    mocks.orderCreate.mockResolvedValue(order);
    mocks.generateBoldCheckoutData.mockReturnValue({
      orderId: "order-id",
      integritySignature: "signature",
    });
    mocks.sendOrderEmail.mockResolvedValue(undefined);
  });

  it("rejects checkout requests that omit mandatory customer information", async () => {
    const response = await POST(createCheckoutRequest({ fullName: "" }), {
      params: { storeId },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "El nombre completo es obligatorio",
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("rejects manipulated totals before creating an order", async () => {
    const response = await POST(
      createCheckoutRequest({ total: 1, subtotal: 1 }),
      { params: { storeId } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Los montos calculados no coinciden con los enviados",
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("does not let a guest save a delivery address", async () => {
    const response = await POST(createCheckoutRequest({ saveAddress: true }), {
      params: { storeId },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Autenticación requerida",
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("creates a pending order using server prices and returns Bold checkout data", async () => {
    const response = await POST(createCheckoutRequest(), {
      params: { storeId },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      order,
      boldData: { orderId: "order-id", integritySignature: "signature" },
    });
    expect(mocks.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderNumber: "ORD-123",
          status: "PENDING",
          phone: "+573001234567",
          subtotal: 10000,
          total: 15000,
          payment: expect.objectContaining({
            create: expect.objectContaining({ method: PaymentMethod.Bold }),
          }),
        }),
      }),
    );
    expect(mocks.generateBoldCheckoutData).toHaveBeenCalledWith(order);
  });

  /**
   * Incidente del 2026-10-07: el correo del pedido nuevo iba en un
   * setImmediate que Vercel no espera y se perdió. Ahora la promesa del envío
   * se entrega a waitUntil para que la función viva hasta que termine.
   */
  it("hands the new-order email to waitUntil instead of a fire-and-forget setImmediate", async () => {
    const response = await POST(createCheckoutRequest(), { params: { storeId } });
    expect(response.status).toBe(200);

    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    await mocks.waitUntil.mock.calls[0][0];
    // El id y lo que la base no sabe todavía (el medio de pago elegido, el
    // correo de la sesión); los artículos los carga el correo.
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(
      "order-id",
      "PENDING",
      expect.objectContaining({ paymentMethod: PaymentMethod.Bold }),
    );
  });

  it("stores a consented GA4 client ID without accepting arbitrary values", async () => {
    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue("123.456");

    await POST(createCheckoutRequest({ analyticsClientId: "123.456" }), {
      params: { storeId },
    });

    expect(mocks.normalizeGoogleAnalyticsClientId).toHaveBeenCalledWith(
      "123.456",
    );
    expect(mocks.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ analyticsClientId: "123.456" }),
      }),
    );
  });

  /** Sin session_id la compra por Measurement Protocol cae en «Unassigned» en GA4. */
  it("stores the GA4 session id only alongside a valid client id, and only if numeric", async () => {
    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue("123.456");
    await POST(createCheckoutRequest({ analyticsClientId: "123.456", analyticsSessionId: "1791180000" }), {
      params: { storeId: "store-1" },
    });
    expect(mocks.orderCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ analyticsSessionId: "1791180000" }) }),
    );

    await POST(createCheckoutRequest({ analyticsClientId: "123.456", analyticsSessionId: "<script>" }), {
      params: { storeId: "store-1" },
    });
    expect(mocks.orderCreate.mock.lastCall?.[0].data).not.toHaveProperty("analyticsSessionId");

    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue(null);
    await POST(createCheckoutRequest({ analyticsSessionId: "1791180000" }), {
      params: { storeId: "store-1" },
    });
    expect(mocks.orderCreate.mock.lastCall?.[0].data).not.toHaveProperty("analyticsSessionId");
  });

  it("records that the shopper accepted analytics", async () => {
    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue("123.456");

    await POST(
      createCheckoutRequest({
        analyticsClientId: "123.456",
        analyticsConsent: true,
      }),
      { params: { storeId } },
    );

    expect(mocks.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ analyticsConsent: true }),
      }),
    );
  });

  it("records a refusal too: that is what makes the gap measurable", async () => {
    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue(null);

    await POST(createCheckoutRequest({ analyticsConsent: false }), {
      params: { storeId },
    });

    const data = mocks.orderCreate.mock.calls.at(-1)?.[0]?.data;
    expect(data).toMatchObject({ analyticsConsent: false });
    // De quien no acepta no se guarda nada más.
    expect(data).not.toHaveProperty("analyticsClientId");
  });

  it("leaves the flag unset when the store owner is the one buying", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-user", user: null });
    mocks.currentUser.mockResolvedValue({
      id: "owner-user",
      emailAddresses: [{ emailAddress: "duena@example.com" }],
    });
    mocks.checkIfStoreOwner.mockResolvedValue(true);
    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue("123.456");

    await POST(
      createCheckoutRequest({
        analyticsClientId: "123.456",
        analyticsConsent: true,
      }),
      { params: { storeId } },
    );

    const data = mocks.orderCreate.mock.calls.at(-1)?.[0]?.data;
    expect(data).not.toHaveProperty("analyticsConsent");
    expect(data).not.toHaveProperty("analyticsClientId");
  });

  it("leaves the flag unset when the storefront does not send it", async () => {
    mocks.normalizeGoogleAnalyticsClientId.mockReturnValue(null);

    await POST(createCheckoutRequest({}), { params: { storeId } });

    expect(mocks.orderCreate.mock.calls.at(-1)?.[0]?.data).not.toHaveProperty(
      "analyticsConsent",
    );
  });

  // Regalo: quien compra sigue en email/fullName; quien recibe va aparte.
  it("stores the recipient of a gift next to the buyer, normalized", async () => {
    const response = await POST(
      createCheckoutRequest({
        isGift: true,
        giftRecipientName: "  Mariana López ",
        giftRecipientEmail: "Mariana@Example.com",
        giftRecipientPhone: "300 123 4567",
        giftMessage: " ¡Feliz cumpleaños! ",
      }),
      { params: { storeId } },
    );

    expect(response.status).toBe(200);
    expect(mocks.orderCreate.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      fullName: "Ana Gómez",
      email: "ana@example.com",
      isGift: true,
      giftRecipientName: "Mariana López",
      giftRecipientEmail: "mariana@example.com",
      giftRecipientPhone: "+573001234567",
      giftMessage: "¡Feliz cumpleaños!",
    });
  });

  it("keeps every gift field null when the order is not a gift", async () => {
    await POST(
      createCheckoutRequest({
        isGift: false,
        giftRecipientName: "Resto de un intento anterior",
        giftRecipientEmail: "otra@example.com",
      }),
      { params: { storeId } },
    );

    expect(mocks.orderCreate.mock.calls.at(-1)?.[0]?.data).toMatchObject({
      isGift: false,
      giftRecipientName: null,
      giftRecipientEmail: null,
      giftRecipientPhone: null,
      giftMessage: null,
    });
  });

  it("rejects a malformed gift-card code before creating anything", async () => {
    const response = await POST(createCheckoutRequest({ giftCardCode: "no-es-un-codigo" }), {
      params: { storeId },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("PDP-XXXX-XXXX-XXXX"),
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it("rejects a gift without the recipient name before creating anything", async () => {
    const response = await POST(
      createCheckoutRequest({ isGift: true, giftRecipientName: "" }),
      { params: { storeId } },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Escribe el nombre de quien recibe el regalo",
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });
});
