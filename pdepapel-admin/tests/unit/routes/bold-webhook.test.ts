import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateOrderFinancials: vi.fn(),
  createGuideForOrder: vi.fn(),
  waitUntil: vi.fn(),
  createInventoryMovementBatchResilient: vi.fn().mockResolvedValue({ success: [], failed: [] }),
  eventCreate: vi.fn().mockResolvedValue({ id: "evt-1" }),
  eventUpdate: vi.fn().mockResolvedValue({}),
  getWebhookSecretKey: vi.fn(),
  findUpdatedOrder: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  findOrder: vi.fn(),
  invalidateStoreProductsCache: vi.fn(),
  recordPaidOrderInGoogleAnalytics: vi.fn(),
  sendOrderEmail: vi.fn(),
  issueGiftCardForOrder: vi.fn().mockResolvedValue(null),
  redeemGiftCardForOrder: vi.fn().mockResolvedValue(null),
  handleGiftCardOnOrderCancellation: vi.fn().mockResolvedValue(undefined),
  deliverGiftCard: vi.fn().mockResolvedValue(true),
  flagPaymentOnCancelledOrder: vi.fn().mockResolvedValue(undefined),
  transaction: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
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
    paymentWebhookEvent: { create: mocks.eventCreate, update: mocks.eventUpdate },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));
// Tarjetas de regalo: la emisión corre dentro de la transacción de pago y el
// correo con el código después; aquí solo se comprueba que se llaman.
vi.mock("@/lib/gift-cards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gift-cards")>()),
  issueGiftCardForOrder: mocks.issueGiftCardForOrder,
  redeemGiftCardForOrder: mocks.redeemGiftCardForOrder,
  handleGiftCardOnOrderCancellation: mocks.handleGiftCardOnOrderCancellation,
}));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: mocks.deliverGiftCard }));
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

vi.mock("@/lib/late-payment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/late-payment")>()),
  flagPaymentOnCancelledOrder: mocks.flagPaymentOnCancelledOrder,
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

  it("keeps a row for a rejected delivery, written before the signature check", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(false);
    const payload = { type: "SALE_APPROVED", data: {} };

    await POST(createWebhookRequest(payload));

    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.eventCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verifyWebhookSignature.mock.invocationCallOrder[0],
    );
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({
      provider: "BOLD",
      rawBody: JSON.stringify(payload),
      signature: "signature",
      payload,
    });
    expect(mocks.eventUpdate).toHaveBeenCalledWith({
      where: { id: "evt-1" },
      data: expect.objectContaining({
        status: "REJECTED",
        statusCode: 400,
        error: "Firma de webhook Bold inválida",
      }),
    });
  });

  it("still answers Bold when the event row cannot be written", async () => {
    mocks.eventCreate.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.verifyWebhookSignature.mockReturnValue(false);

    const response = await POST(createWebhookRequest({ type: "SALE_APPROVED", data: {} }));

    expect(response.status).toBe(400);
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
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

  it("a datáfono sale from the point of sale lands in the kardex as «Venta presencial», not as an online order", async () => {
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
      id: "pos-order-id",
      orderNumber: "ORD-POS-1",
      type: OrderType.POINT_OF_SALE,
      payment: { method: PaymentMethod.Bold },
      status: OrderStatus.PENDING,
      storeId: "store-id",
      shippingCost: 0,
      total: 40000,
      coupon: null,
      orderItems: [{ productId: "product-id", quantity: 1, product: { acqPrice: 15000, price: 40000 } }],
    };
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue(order);
    mocks.findUpdatedOrder.mockResolvedValue({ ...order, status: OrderStatus.PAID, shipping: null });
    mocks.transaction.mockImplementation(async (callback: any) => callback(transactionClient));
    mocks.calculateOrderFinancials.mockResolvedValue({ totalProductCost: 15000, gatewayFee: 0, shippingCost: 0, netProfit: 25000, profitMarginPct: 62.5 });

    const response = await POST(
      createWebhookRequest({
        type: "SALE_APPROVED",
        data: { amount: { currency: "COP", total: 40000 }, metadata: { reference: "ORD-POS-1" }, payment_id: "bold-pos-tx" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledWith(transactionClient, [
      expect.objectContaining({
        type: "IN_PERSON_SALE",
        quantity: -1,
        reason: "Venta presencial (datáfono): pago confirmado bold-pos-tx",
        referenceId: "pos-order-id",
        createdBy: "SYSTEM_BOLD",
      }),
    ]);
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
    // Solo el id: el correo carga el pedido completo con sus artículos.
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith("order-id", OrderStatus.PAID);
    expect(mocks.recordPaidOrderInGoogleAnalytics).toHaveBeenCalledWith(
      "order-id",
    );
    expect(mocks.createGuideForOrder).not.toHaveBeenCalled();
  });

  /**
   * La guía de EnvioClick de un pago aprobado iba en un setImmediate que
   * Vercel no espera (incidente del 2026-10-07). Ahora va por waitUntil.
   */
  it("creates the EnvioClick guide through waitUntil when the order has a quoted rate", async () => {
    const transactionClient = {
      order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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
      coupon: null,
      orderItems: [{ productId: "product-id", quantity: 1, product: { acqPrice: 15000, price: 75000 } }],
    };
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue(order);
    mocks.findUpdatedOrder.mockResolvedValue({
      ...order,
      status: OrderStatus.PAID,
      shipping: { envioClickIdOrder: null, envioClickIdRate: "rate-1" },
    });
    mocks.transaction.mockImplementation(async (callback: any) => callback(transactionClient));
    mocks.calculateOrderFinancials.mockResolvedValue({});
    mocks.createGuideForOrder.mockResolvedValue({});

    const response = await POST(
      createWebhookRequest({
        type: "SALE_APPROVED",
        data: { amount: { currency: "COP", total: 80000 }, metadata: { reference: "ORD-123" }, payment_id: "bold-tx" },
      }),
    );
    expect(response.status).toBe(200);

    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    await mocks.waitUntil.mock.calls[0][0];
    expect(mocks.createGuideForOrder).toHaveBeenCalledWith("order-id", "store-id");
  });

  it("checks the paid amount against the total minus what a gift card covered", async () => {
    const transactionClient = {
      order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      paymentDetails: { upsert: vi.fn() },
      shipping: { upsert: vi.fn() },
      couponRedemption: { updateMany: vi.fn() },
    };
    mocks.verifyWebhookSignature.mockReturnValue(true);
    const covered = { id: "order-id", orderNumber: "ORD-123", storeId: "store-id", fullName: "Luisa", type: "STANDARD", payment: { method: PaymentMethod.Bold }, status: OrderStatus.PENDING, total: 80000, giftCardId: "card-1", giftCardAmount: 30000, orderItems: [], coupon: null };
    mocks.findOrder.mockResolvedValue(covered);
    mocks.findUpdatedOrder.mockResolvedValue({ ...covered, status: OrderStatus.PAID, shipping: null });
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));
    mocks.calculateOrderFinancials.mockResolvedValue({ totalProductCost: 0, gatewayFee: 0, shippingCost: 0, netProfit: 0, profitMarginPct: 0 });
    mocks.createInventoryMovementBatchResilient.mockResolvedValue({ success: [], failed: [] });

    // El total completo ya no es lo que Bold cobró: se rechaza.
    const wrong = await POST(createWebhookRequest({ type: "SALE_APPROVED", data: { amount: { currency: "COP", total: 80000 }, metadata: { reference: "ORD-123" } } }));
    expect(wrong.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();

    const right = await POST(createWebhookRequest({ type: "SALE_APPROVED", data: { amount: { currency: "COP", total: 50000 }, metadata: { reference: "ORD-123" } } }));
    expect(right.status).toBe(200);
    expect(transactionClient.order.updateMany).toHaveBeenCalled();
  });

  it("issues a gift card inside the payment transaction and mails the code after it commits", async () => {
    const issued = { card: { id: "card-1", purchaseOrderId: "order-id", codeLast4: "ABCD" }, code: "PDP-AAAA-BBBB-CCCC", deliverTo: "mariana@example.com" };
    mocks.issueGiftCardForOrder.mockResolvedValueOnce(issued);
    const transactionClient = {
      order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      coupon: { update: vi.fn(), updateMany: vi.fn() },
      paymentDetails: { upsert: vi.fn() },
      shipping: { upsert: vi.fn() },
      couponRedemption: { updateMany: vi.fn() },
    };
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue({
      id: "order-id",
      orderNumber: "ORD-123",
      storeId: "store-id",
      fullName: "Luisa Sánchez",
      type: "GIFT_CARD",
      payment: { method: PaymentMethod.Bold },
      status: OrderStatus.PENDING,
      total: 100000,
      orderItems: [],
      coupon: null,
    });
    mocks.findUpdatedOrder.mockResolvedValue({ id: "order-id", orderNumber: "ORD-123", storeId: "store-id", status: OrderStatus.PAID, type: "GIFT_CARD", payment: { method: PaymentMethod.Bold }, shipping: null, orderItems: [] });
    mocks.transaction.mockImplementation(async (cb: any) => cb(transactionClient));
    mocks.calculateOrderFinancials.mockResolvedValue({ totalProductCost: 0, gatewayFee: 0, shippingCost: 0, netProfit: 0, profitMarginPct: 0 });
    mocks.createInventoryMovementBatchResilient.mockResolvedValue({ success: [], failed: [] });

    const response = await POST(
      createWebhookRequest({
        type: "SALE_APPROVED",
        data: { amount: { currency: "COP", total: 100000 }, metadata: { reference: "ORD-123" } },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.issueGiftCardForOrder).toHaveBeenCalledWith(transactionClient, expect.objectContaining({ storeId: "store-id", orderId: "order-id" }));
    // Una tarjeta no se empaca: no se abre envío.
    expect(transactionClient.shipping.upsert).not.toHaveBeenCalled();
    expect(mocks.deliverGiftCard).toHaveBeenCalledWith(issued, { buyerName: "Luisa Sánchez" });
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
    // Entró plata en un pedido cancelado: se marca para revisar o reembolsar y se avisa.
    expect(mocks.flagPaymentOnCancelledOrder).toHaveBeenCalledWith("order-id", "Bold");
  });

  it("una aprobación repetida sobre un pedido ya pagado no marca nada", async () => {
    mocks.verifyWebhookSignature.mockReturnValue(true);
    mocks.findOrder.mockResolvedValue({ id: "order-id", orderNumber: "ORD-123", payment: { method: PaymentMethod.Bold }, status: OrderStatus.PAID, storeId: "store-id", total: 80000, orderItems: [] });
    mocks.transaction.mockImplementation(async (cb: any) => cb({ order: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) } }));
    await POST(createWebhookRequest({ type: "SALE_APPROVED", data: { amount: { currency: "COP", total: 80000 }, metadata: { reference: "ORD-123" } } }));
    expect(mocks.flagPaymentOnCancelledOrder).not.toHaveBeenCalled();
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
