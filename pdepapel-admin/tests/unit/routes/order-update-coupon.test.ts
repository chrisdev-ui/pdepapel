import { DiscountType, OrderStatus, OrderType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const selectedCoupon = {
    id: "coupon-solaris",
    storeId: "store-1",
    code: "SOLARIS10",
    type: "PERCENTAGE",
    amount: 10,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T23:59:59.999Z"),
    maxUses: 99,
    usedCount: 0,
    isActive: true,
    minOrderValue: 0,
    isWelcomeBenefit: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const existingOrder = {
    id: "order-1",
    storeId: "store-1",
    orderNumber: "ORD-1",
    status: "DRAFT",
    type: "QUOTATION",
    token: "quote-token",
    expiresAt: null,
    userId: null,
    guestId: "guest-1",
    fullName: "Cliente",
    phone: "3000000000",
    email: "cliente@example.com",
    address: "Calle 1",
    coupon: null,
    shipping: null,
    payment: null,
    orderItems: [{ productId: "product-1", quantity: 1 }],
  };

  const orderUpdate = vi.fn();
  const transactionClient = {
    orderItem: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    order: { update: orderUpdate },
    coupon: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    couponRedemption: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  return {
    selectedCoupon,
    existingOrder,
    orderUpdate,
    transactionClient,
    findOrder: vi.fn(),
    findCoupon: vi.fn(),
    verifyStoreOwner: vi.fn(),
    processOrderItemsInBatches: vi.fn(),
    getProductsPrices: vi.fn(),
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "owner-1" }),
  clerkClient: async () => ({ users: { getUser: vi.fn() } }),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findUnique: mocks.findOrder },
    coupon: {
      findFirst: mocks.findCoupon,
      fields: { maxUses: "maxUses-field-reference" },
    },
    $transaction: vi.fn((callback) => callback(mocks.transactionClient)),
  },
}));

vi.mock("@/lib/cors", () => ({
  createCorsHeaders: () => ({}),
}));

vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { DYNAMIC: {}, NO_CACHE: {} },
  verifyStoreOwner: mocks.verifyStoreOwner,
  processOrderItemsInBatches: mocks.processOrderItemsInBatches,
  calculateOrderTotals: (
    items: Array<{ product: { price: number }; quantity: number }>,
    config?: {
      discount?: { type: DiscountType; amount: number };
      coupon?: { type: DiscountType; amount: number };
      shippingCost?: number;
    },
  ) => {
    const subtotal = items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    const discount = config?.discount
      ? config.discount.type === DiscountType.PERCENTAGE
        ? (subtotal * config.discount.amount) / 100
        : Math.min(subtotal, config.discount.amount)
      : 0;
    const afterDiscount = subtotal - discount;
    const couponDiscount = config?.coupon
      ? config.coupon.type === DiscountType.PERCENTAGE
        ? (afterDiscount * config.coupon.amount) / 100
        : Math.min(afterDiscount, config.coupon.amount)
      : 0;
    return {
      subtotal,
      discount,
      couponDiscount,
      total: subtotal - discount - couponDiscount + (config?.shippingCost || 0),
    };
  },
}));

vi.mock("@/lib/discount-engine", () => ({
  getProductsPrices: mocks.getProductsPrices,
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn() }));
vi.mock("@/lib/inventory", () => ({
  createInventoryMovementBatchResilient: vi.fn(),
  createInventoryMovementBatch: vi.fn(),
  validateStockAvailability: vi.fn(),
}));
vi.mock("@/lib/financial", () => ({ calculateOrderFinancials: vi.fn() }));
vi.mock("@/lib/google-analytics", () => ({
  recordPaidOrderInGoogleAnalytics: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/customer-benefits", () => ({
  assertWelcomeBenefitEligibility: vi.fn(),
  markWelcomeBenefitRedeemed: vi.fn(),
  releaseWelcomeBenefitReservation: vi.fn(),
  reserveWelcomeBenefit: vi.fn(),
}));

import { PATCH } from "@/app/api/[storeId]/orders/[orderId]/route";

describe("PATCH order coupon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("setImmediate", vi.fn());
    mocks.findOrder.mockResolvedValue(mocks.existingOrder);
    mocks.findCoupon.mockResolvedValue(mocks.selectedCoupon);
    mocks.processOrderItemsInBatches.mockResolvedValue([
      {
        id: "product-1",
        name: "Producto",
        sku: "SKU-1",
        price: 10_000,
        images: [],
      },
    ]);
    mocks.getProductsPrices.mockResolvedValue(
      new Map([
        ["product-1", { price: 10_000, discount: 0, offerLabel: null }],
      ]),
    );
    mocks.orderUpdate.mockImplementation(({ data }) =>
      Promise.resolve({
        ...mocks.existingOrder,
        subtotal: data.subtotal,
        discount: data.discount,
        couponDiscount: data.couponDiscount,
        total: data.total,
        coupon: data.coupon?.connect ? mocks.selectedCoupon : null,
        orderItems: [
          {
            productId: "product-1",
            quantity: 1,
            product: { acqPrice: 5_000 },
          },
        ],
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects and deducts a newly selected coupon instead of keeping the old relation", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/store-1/orders/order-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderItems: [
            {
              productId: "product-1",
              quantity: 1,
              price: 10_000,
              name: "Producto",
              sku: "SKU-1",
            },
          ],
          status: OrderStatus.DRAFT,
          type: OrderType.QUOTATION,
          subtotal: 10_000,
          total: 9_000,
          discount: {},
          couponCode: "SOLARIS10",
        }),
      }),
      { params: { storeId: "store-1", orderId: "order-1" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.findCoupon).toHaveBeenCalled();
    expect(mocks.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coupon: { connect: { id: "coupon-solaris" } },
          couponDiscount: 1_000,
          subtotal: 10_000,
          total: 9_000,
        }),
      }),
    );
  });

  it("disconnects an explicitly removed coupon and restores the undiscounted total", async () => {
    mocks.findOrder.mockResolvedValue({
      ...mocks.existingOrder,
      coupon: mocks.selectedCoupon,
    });

    const response = await PATCH(
      new Request("http://localhost/api/store-1/orders/order-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderItems: [
            {
              productId: "product-1",
              quantity: 1,
              price: 10_000,
              name: "Producto",
              sku: "SKU-1",
            },
          ],
          status: OrderStatus.DRAFT,
          type: OrderType.QUOTATION,
          subtotal: 10_000,
          total: 10_000,
          discount: {},
          couponCode: "",
        }),
      }),
      { params: { storeId: "store-1", orderId: "order-1" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.findCoupon).not.toHaveBeenCalled();
    expect(mocks.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coupon: { disconnect: true },
          couponDiscount: 0,
          subtotal: 10_000,
          total: 10_000,
        }),
      }),
    );
  });

  it("refuses to rewrite the coupon while an order remains paid", async () => {
    mocks.findOrder.mockResolvedValue({
      ...mocks.existingOrder,
      status: OrderStatus.PAID,
    });

    const response = await PATCH(
      new Request("http://localhost/api/store-1/orders/order-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderItems: [
            {
              productId: "product-1",
              quantity: 1,
              price: 10_000,
            },
          ],
          status: OrderStatus.PAID,
          subtotal: 10_000,
          total: 9_000,
          discount: {},
          couponCode: "SOLARIS10",
        }),
      }),
      { params: { storeId: "store-1", orderId: "order-1" } },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "El cupón de un pedido pagado no se puede cambiar: el descuento ya se cobró. Cancela el pedido y crea uno nuevo si hace falta.",
    });
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
  });
});
