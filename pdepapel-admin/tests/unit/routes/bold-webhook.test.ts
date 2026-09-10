import { OrderStatus, PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateOrderFinancials: vi.fn(),
  createGuideForOrder: vi.fn(),
  createInventoryMovementBatchResilient: vi.fn().mockResolvedValue({ success: [], failed: [] }),
  getWebhookSecretKey: vi.fn(),
  findUpdatedOrder: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  findOrder: vi.fn(),
  invalidateStoreProductsCache: vi.fn(),
  recordPaidOrderInGoogleAnalytics: vi.fn(),
  sendOrderEmail: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/bold", () => ({
  getBoldWebhookSecretKey: mocks.getWebhookSecretKey,
  verifyBoldWebhookSignature: mocks.verifyWebhookSignature,
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    order: {
      findFirst: mocks.findOrder,
      findUnique: mocks.findUpdatedOrder,
    },
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
vi.mock("@/lib/cache", () => ({
  invalidateStoreProductsCache: mocks.invalidateStoreProductsCache,
}));
vi.mock("@/lib/financial", () => ({
  calculateOrderFinancials: mocks.calculateOrderFinancials,
}));
vi.mock("@/lib/google-analytics", () => ({
  recordPaidOrderInGoogleAnalytics: mocks.recordPaidOrderInGoogleAnalytics,
}));

import { POST } from "@/app/api/webhook/bold/route";

function createWebhookRequest(payload: unknown) {
  return new Request("https://admin.example.com/api/webhook/bold", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-bold-signature": "signature",
    },
    method: "POST",
  });
}

describe("POST /api/webhook/bold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWebhookSecretKey.mockReturnValue("webhook-secret");
  });

  it("rejects webhook payloads with an invalid signature before querying orders", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(false);

    const response = await POST(
      createWebhookRequest({ type: "SALE_APPROVED", data: {} }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Firma de webhook Bold inválida",
    });
    expect(mocks.findOrder).not.toHaveBeenCalled();
  });

  it("acknowledges repeated approved events without changing paid orders again", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Bold },
      status: OrderStatus.PAID,
      total: 80000,
    });

    const response = await POST(
      createWebhookRequest({
        type: "SALE_APPROVED",
        data: {
          amount: { currency: "COP", total: 80000 },
          metadata: { reference: "ORD-123" },
          payment_id: "bold-transaction-id",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Orden ORD-123 ya fue procesada anteriormente",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.recordPaidOrderInGoogleAnalytics).toHaveBeenCalledWith(
      "order-id",
    );
  });

  it("records an approved payment once, updates stock, and notifies the customer", async () => {
    const transactionClient = {
      order: {
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      paymentDetails: { upsert: vi.fn() },
      shipping: { upsert: vi.fn() },
    };
    const order = {
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Bold },
      status: OrderStatus.PENDING,
      storeId: "store-id",
      shippingCost: 5000,
      total: 80000,
      coupon: { id: "coupon-id" },
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
      gatewayFee: 0,
      shippingCost: 5000,
      netProfit: 45000,
      profitMarginPct: 56.25,
    };

    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue(order);
    mocks.findUpdatedOrder.mockResolvedValue(updatedOrder);
    mocks.transaction.mockImplementation(async (callback: any) =>
      callback(transactionClient),
    );
    mocks.calculateOrderFinancials.mockResolvedValue(financials);

    const response = await POST(
      createWebhookRequest({
        type: "SALE_APPROVED",
        data: {
          amount: { currency: "COP", total: 80000 },
          metadata: { reference: "ORD-123" },
          payment_id: "bold-transaction-id",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      orderId: "order-id",
    });
    expect(transactionClient.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-id",
        status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
      },
      data: { status: OrderStatus.PAID },
    });
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledWith(
      transactionClient,
      [
        {
          productId: "product-id",
          storeId: "store-id",
          type: "ORDER_PLACED",
          quantity: -2,
          reason: "Bold: pago confirmado bold-transaction-id",
          referenceId: "order-id",
          cost: 15000,
          price: 40000,
          createdBy: "SYSTEM_BOLD",
        },
      ],
    );
    expect(mocks.calculateOrderFinancials).toHaveBeenCalledWith(
      order,
      PaymentMethod.Bold,
      5000,
      transactionClient,
    );
    expect(transactionClient.order.update).toHaveBeenCalledWith({
      where: { id: "order-id" },
      data: expect.objectContaining(financials),
    });
    expect(transactionClient.coupon.update).toHaveBeenCalledWith({
      where: { id: "coupon-id" },
      data: { usedCount: { increment: 1 } },
    });
    expect(transactionClient.paymentDetails.upsert).toHaveBeenCalledTimes(1);
    expect(transactionClient.shipping.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledWith("store-id");
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-id", payment: PaymentMethod.Bold }),
      OrderStatus.PAID,
    );
    expect(mocks.recordPaidOrderInGoogleAnalytics).toHaveBeenCalledWith(
      "order-id",
    );
    expect(mocks.createGuideForOrder).not.toHaveBeenCalled();
  });

  it("does not resurrect a cancelled order when an old approval is replayed", async () => {
    const transactionClient = {
      order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      paymentDetails: { upsert: vi.fn() },
      shipping: { upsert: vi.fn() },
    };
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Bold },
      status: OrderStatus.CANCELLED,
      storeId: "store-id",
      total: 80000,
      orderItems: [],
    });
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));

    const response = await POST(
      createWebhookRequest({
        type: "SALE_APPROVED",
        data: {
          amount: { currency: "COP", total: 80000 },
          metadata: { reference: "ORD-123" },
          payment_id: "bold-transaction-id",
        },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Orden ORD-123 ya fue procesada anteriormente",
    });
    expect(mocks.createInventoryMovementBatchResilient).not.toHaveBeenCalled();
  });

  it("treats a void on an already paid order as a real cancellation with restock", async () => {
    const orderUpdateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 }); // la reclamación sobre el pedido pagado
    const transactionClient = {
      order: { update: vi.fn(), updateMany: orderUpdateMany },
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      couponRedemption: { updateMany: vi.fn() },
      paymentDetails: { upsert: vi.fn() },
      shipping: { upsert: vi.fn() },
    };
    const order = {
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Bold },
      status: OrderStatus.PAID,
      storeId: "store-id",
      total: 80000,
      userId: "user-id",
      coupon: { id: "coupon-id", isWelcomeBenefit: true },
      orderItems: [
        { productId: "product-id", quantity: 2, product: { acqPrice: 15000, price: 40000 } },
      ],
    };
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue(order);
    mocks.findUpdatedOrder.mockResolvedValue({ ...order, status: OrderStatus.CANCELLED });
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));

    const response = await POST(
      createWebhookRequest({
        type: "VOID_APPROVED",
        data: { metadata: { reference: "ORD-123" }, payment_id: "bold-transaction-id" },
      }),
    );

    expect(response.status).toBe(200);
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-id", status: OrderStatus.PAID },
      data: { status: OrderStatus.CANCELLED, paidAt: null },
    });
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledWith(
      transactionClient,
      [
        expect.objectContaining({
          productId: "product-id",
          type: "ORDER_CANCELLED",
          quantity: 2,
        }),
      ],
    );
    expect(transactionClient.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: "coupon-id", usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledWith("store-id");
  });

  it("stores no transaction id when the provider sends none", async () => {
    const transactionClient = {
      order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      paymentDetails: { upsert: vi.fn() },
      shipping: { upsert: vi.fn() },
    };
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      payment: { method: PaymentMethod.Bold },
      status: OrderStatus.PENDING,
      storeId: "store-id",
      total: 80000,
      orderItems: [],
    });
    mocks.findUpdatedOrder.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));
    mocks.calculateOrderFinancials.mockResolvedValue({});

    await POST(
      createWebhookRequest({
        type: "SALE_APPROVED",
        data: { amount: { currency: "COP", total: 80000 }, metadata: { reference: "ORD-123" } },
      }),
    );

    expect(transactionClient.paymentDetails.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ transactionId: null }),
      }),
    );
  });

  it("answers 400 to a body that is not JSON so Bold stops retrying", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(true);
    const response = await POST(
      new Request("https://admin.example.com/api/webhook/bold", {
        method: "POST",
        headers: { "content-type": "application/json", "x-bold-signature": "signature" },
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.findOrder).not.toHaveBeenCalled();
  });
});
