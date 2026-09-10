import crypto from "node:crypto";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateOrderFinancials: vi.fn(),
  createGuideForOrder: vi.fn(),
  createInventoryMovementBatchResilient: vi.fn(),
  findOrder: vi.fn(),
  findUpdatedOrder: vi.fn(),
  invalidateStoreProductsCache: vi.fn(),
  recordPaidOrderInGoogleAnalytics: vi.fn(),
  paymentUpsert: vi.fn(),
  sendOrderEmail: vi.fn(),
  shippingUpsert: vi.fn(),
  transaction: vi.fn(),
  markWelcomeBenefitRedeemed: vi.fn(),
  releaseWelcomeBenefitReservation: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({
  env: { WOMPI_EVENTS_KEY: "wompi-events-key" },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    order: {
      findFirst: mocks.findOrder,
      findUnique: mocks.findUpdatedOrder,
    },
    paymentDetails: { upsert: mocks.paymentUpsert },
    shipping: { upsert: mocks.shippingUpsert },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));
vi.mock("@/lib/shipping-helpers", () => ({
  createGuideForOrder: mocks.createGuideForOrder,
}));
vi.mock("@/lib/inventory", () => ({
  createInventoryMovementBatchResilient:
    mocks.createInventoryMovementBatchResilient,
}));
// Sin kits, la explosión devuelve los mismos movimientos.
vi.mock("@/lib/order-stock-movements", () => ({
  explodeKitMovements: async (_tx: unknown, movements: unknown) => movements,
}));
vi.mock("@/lib/customer-benefits", () => ({
  markWelcomeBenefitRedeemed: mocks.markWelcomeBenefitRedeemed,
  releaseWelcomeBenefitReservation: mocks.releaseWelcomeBenefitReservation,
}));
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: mocks.invalidateStoreProductsCache,
}));
vi.mock("@/lib/financial", () => ({
  calculateOrderFinancials: mocks.calculateOrderFinancials,
}));
vi.mock("@/lib/google-analytics", () => ({
  recordPaidOrderInGoogleAnalytics: mocks.recordPaidOrderInGoogleAnalytics,
}));

import { POST } from "@/app/api/webhook/wompi/route";

function createWebhookRequest(transaction: Record<string, unknown>) {
  const data = { transaction };
  const properties = [
    "transaction.id",
    "transaction.reference",
    "transaction.amount_in_cents",
    "transaction.status",
  ];
  const payload = {
    event: "transaction.updated",
    data,
    signature: { properties, checksum: "" },
    timestamp: 123456,
  };
  const stringToSign = properties
    .map((property) =>
      property.split(".").reduce((value: any, key) => value[key], data as any),
    )
    .join("");

  payload.signature.checksum = crypto
    .createHash("sha256")
    .update(`${stringToSign}${payload.timestamp}wompi-events-key`)
    .digest("hex");

  return new Request("https://admin.example.com/api/webhook/wompi", {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/webhook/wompi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInventoryMovementBatchResilient.mockResolvedValue({
      failed: [],
      success: [],
    });
  });

  it("rejects callbacks with an invalid Wompi checksum before querying orders", async () => {
    const response = await POST(
      new Request("https://admin.example.com/api/webhook/wompi", {
        body: JSON.stringify({
          event: "transaction.updated",
          data: { transaction: {} },
          signature: { properties: [], checksum: "invalid" },
          timestamp: 1,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.findOrder).not.toHaveBeenCalled();
  });

  it("processes an approved payment once and prevents duplicate stock deductions", async () => {
    const transactionClient = {
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      order: {
        update: vi.fn(),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      paymentDetails: { upsert: mocks.paymentUpsert },
      shipping: { upsert: mocks.shippingUpsert },
    };
    const order = {
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Wompi },
      status: OrderStatus.PENDING,
      storeId: "store-id",
      shipping: { cost: 5000 },
      coupon: { id: "coupon-id" },
      total: 80000,
      orderItems: [
        {
          productId: "product-id",
          quantity: 2,
          product: { acqPrice: 15000, price: 40000 },
        },
      ],
    };
    const updatedOrder = {
      ...order,
      status: OrderStatus.PAID,
      shipping: { envioClickIdOrder: null, envioClickIdRate: null },
    };
    const financials = {
      totalProductCost: 30000,
      gatewayFee: 3189.2,
      shippingCost: 5000,
      netProfit: 41810.8,
      profitMarginPct: 52.2635,
    };

    mocks.findOrder.mockResolvedValue(order);
    mocks.findUpdatedOrder.mockResolvedValue(updatedOrder);
    mocks.transaction.mockImplementation(async (callback: any) =>
      callback(transactionClient),
    );
    mocks.calculateOrderFinancials.mockResolvedValue(financials);
    const transaction = {
      id: "wompi-transaction-id",
      reference: "order-id",
      amount_in_cents: 8000000,
      status: "APPROVED",
    };

    const firstResponse = await POST(createWebhookRequest(transaction));
    const duplicateResponse = await POST(createWebhookRequest(transaction));

    expect(firstResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(200);
    await expect(duplicateResponse.json()).resolves.toEqual({
      message: "Orden ORD-123 ya fue procesada anteriormente",
    });
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledTimes(
      1,
    );
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledWith(
      transactionClient,
      [
        expect.objectContaining({
          quantity: -2,
          reason: "Wompi: Pago confirmado wompi-transaction-id",
          type: "ORDER_PLACED",
        }),
      ],
    );
    expect(mocks.calculateOrderFinancials).toHaveBeenCalledWith(
      order,
      PaymentMethod.Wompi,
      5000,
      transactionClient,
    );
    expect(transactionClient.coupon.update).toHaveBeenCalledWith({
      where: { id: "coupon-id" },
      data: { usedCount: { increment: 1 } },
    });
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledTimes(1);
    expect(mocks.paymentUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.shippingUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1);
    expect(mocks.recordPaidOrderInGoogleAnalytics).toHaveBeenCalledWith(
      "order-id",
    );
  });

  it("restocks a paid order only once when Wompi cancels it", async () => {
    const transactionClient = {
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      order: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentDetails: { upsert: mocks.paymentUpsert },
      shipping: { upsert: mocks.shippingUpsert },
    };
    const order = {
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Wompi },
      status: OrderStatus.PAID,
      storeId: "store-id",
      coupon: { id: "coupon-id" },
      total: 80000,
      orderItems: [
        {
          productId: "product-id",
          quantity: 2,
          product: { acqPrice: 15000, price: 40000 },
        },
      ],
    };

    mocks.findOrder.mockResolvedValue(order);
    mocks.findUpdatedOrder.mockResolvedValue({
      ...order,
      status: OrderStatus.CANCELLED,
      shipping: null,
    });
    mocks.transaction.mockImplementation(async (callback: any) =>
      callback(transactionClient),
    );

    const response = await POST(
      createWebhookRequest({
        id: "wompi-cancelled-id",
        reference: "order-id",
        amount_in_cents: 8000000,
        status: "VOIDED",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledWith(
      transactionClient,
      [
        expect.objectContaining({
          quantity: 2,
          reason: "Wompi: Transacción anulada/error wompi-cancelled-id",
          type: "ORDER_CANCELLED",
        }),
      ],
    );
    expect(transactionClient.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: "coupon-id", usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    // Una anulación ya no deja el envío en «Preparando».
    expect(mocks.shippingUpsert).not.toHaveBeenCalled();
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledTimes(1);
  });

  it("answers 400 to a body that is not JSON so Wompi stops retrying", async () => {
    const response = await POST(
      new Request("https://admin.example.com/api/webhook/wompi", {
        body: "no soy json",
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.findOrder).not.toHaveBeenCalled();
  });

  it("rejects a signed event whose signed property is missing, without a 500", async () => {
    const response = await POST(
      new Request("https://admin.example.com/api/webhook/wompi", {
        body: JSON.stringify({
          event: "transaction.updated",
          data: { transaction: { id: "x" } },
          signature: { properties: ["transaction.amount_in_cents"], checksum: "abc" },
          timestamp: 1,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.findOrder).not.toHaveBeenCalled();
  });

  it("refuses a payment reported in another currency", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Wompi },
      status: OrderStatus.PENDING,
      storeId: "store-id",
      total: 80000,
      orderItems: [],
    });

    const response = await POST(
      createWebhookRequest({
        id: "wompi-transaction-id",
        reference: "order-id",
        amount_in_cents: 8000000,
        status: "APPROVED",
        currency: "USD",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("accepts an amount that only differs by floating-point noise", async () => {
    const transactionClient = {
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      paymentDetails: { upsert: mocks.paymentUpsert },
      shipping: { upsert: mocks.shippingUpsert },
    };
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Wompi },
      status: OrderStatus.PENDING,
      storeId: "store-id",
      // 80000 guardado como Float puede volver con ruido decimal.
      total: 80000.000000001,
      orderItems: [],
    });
    mocks.findUpdatedOrder.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));
    mocks.calculateOrderFinancials.mockResolvedValue({});

    const response = await POST(
      createWebhookRequest({
        id: "wompi-transaction-id",
        reference: "order-id",
        amount_in_cents: 8000000,
        status: "APPROVED",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it("marks the welcome benefit redeemed when the payment is confirmed", async () => {
    const transactionClient = {
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      paymentDetails: { upsert: mocks.paymentUpsert },
      shipping: { upsert: mocks.shippingUpsert },
    };
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Wompi },
      status: OrderStatus.PENDING,
      storeId: "store-id",
      total: 80000,
      userId: "user-id",
      // Antes el select del cupón no traía isWelcomeBenefit y esto nunca corría.
      coupon: { id: "coupon-id", isWelcomeBenefit: true },
      orderItems: [],
    });
    mocks.findUpdatedOrder.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));
    mocks.calculateOrderFinancials.mockResolvedValue({});

    await POST(
      createWebhookRequest({
        id: "wompi-transaction-id",
        reference: "order-id",
        amount_in_cents: 8000000,
        status: "APPROVED",
      }),
    );

    expect(mocks.markWelcomeBenefitRedeemed).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({ couponId: "coupon-id", orderId: "order-id" }),
    );
    expect(mocks.releaseWelcomeBenefitReservation).not.toHaveBeenCalled();
  });

  it("clears the paid date when a paid order is voided", async () => {
    const orderUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transactionClient = {
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      order: { update: vi.fn(), updateMany: orderUpdateMany },
      paymentDetails: { upsert: mocks.paymentUpsert },
      shipping: { upsert: mocks.shippingUpsert },
    };
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Wompi },
      status: OrderStatus.PAID,
      storeId: "store-id",
      total: 80000,
      userId: "user-id",
      coupon: { id: "coupon-id", isWelcomeBenefit: true },
      orderItems: [],
    });
    mocks.findUpdatedOrder.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));

    await POST(
      createWebhookRequest({
        id: "wompi-void-id",
        reference: "order-id",
        amount_in_cents: 8000000,
        status: "VOIDED",
      }),
    );

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-id", status: OrderStatus.PAID },
      data: { status: OrderStatus.CANCELLED, paidAt: null },
    });
    expect(mocks.releaseWelcomeBenefitReservation).toHaveBeenCalled();
  });
});
