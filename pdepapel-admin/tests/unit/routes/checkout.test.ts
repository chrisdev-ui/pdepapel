import { PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
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
  orderCreate: vi.fn(),
  sendOrderEmail: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@clerk/nextjs", () => ({
  auth: mocks.auth,
  clerkClient: { users: { getUser: vi.fn() } },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    coupon: { findFirst: mocks.findCoupon, fields: { maxUses: "maxUses" } },
    order: {
      create: mocks.orderCreate,
      findUnique: mocks.findOrder,
    },
    product: { findMany: mocks.findProducts },
    shippingQuote: { findMany: mocks.findShippingQuotes },
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
vi.mock("@/lib/order-totals", () => ({
  calculateOrderTotals: mocks.calculateOrderTotals,
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
    mocks.calculateOrderTotals.mockReturnValue({
      subtotal: 10000,
      discount: 0,
      couponDiscount: 0,
      total: 15000,
    });
    mocks.generateOrderNumber.mockReturnValue("ORD-123");
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
});
