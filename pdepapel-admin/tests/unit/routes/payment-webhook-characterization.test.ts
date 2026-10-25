import crypto from "node:crypto";
import { OrderInventoryIssueKind, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lo que hacen hoy los dos webhooks de pago, rama por rama, antes y después
 * de compartir `lib/payment-settlement.ts`. Las aserciones marcadas «regla
 * unificada» son las cinco diferencias que el dueño decidió igualar
 * (lote de pagos del 2026-10-26); todo lo demás no debe moverse.
 */
const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(),
  findUpdatedOrder: vi.fn(),
  transaction: vi.fn(),
  eventCreate: vi.fn(),
  eventUpdate: vi.fn(),
  verifySignature: vi.fn(),
  calculateOrderFinancials: vi.fn(),
  createInventoryMovementBatchResilient: vi.fn(),
  recordInventoryIssues: vi.fn(),
  settlePresaleLinesOnPayment: vi.fn(),
  releasePresaleLinesOnCancellation: vi.fn(),
  issueGiftCardForOrder: vi.fn(),
  redeemGiftCardForOrder: vi.fn(),
  handleGiftCardOnOrderCancellation: vi.fn(),
  deliverGiftCard: vi.fn(),
  markWelcomeBenefitRedeemed: vi.fn(),
  releaseWelcomeBenefitReservation: vi.fn(),
  invalidateStoreProductsCache: vi.fn(),
  recordPaidOrderInGoogleAnalytics: vi.fn(),
  sendOrderEmail: vi.fn(),
  createGuideForOrder: vi.fn(),
  flagPaymentOnCancelledOrder: vi.fn(),
  notifyLatePaymentRevival: vi.fn(),
  waitUntil: vi.fn(),
  redisKeys: new Set<string>(),
  resendSend: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      set: async (key: string) => {
        if (mocks.redisKeys.has(key)) return null;
        mocks.redisKeys.add(key);
        return "OK";
      },
    }),
  },
}));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: async () => ["avisos@prueba.test"] }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.resendSend } } }));

vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("@/lib/env.mjs", () => ({ env: { WOMPI_EVENTS_KEY: "wompi-events-key" } }));
vi.mock("@/lib/bold", () => ({
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: mocks.verifySignature,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    order: { findFirst: mocks.findOrder, findUnique: mocks.findUpdatedOrder },
    paymentWebhookEvent: { create: mocks.eventCreate, update: mocks.eventUpdate },
    orderInventoryIssue: { count: async () => 0 },
    capsuleOrder: { findMany: async () => [] },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: mocks.sendOrderEmail }));
vi.mock("@/lib/capsule-payment", () => ({ applyCapsulePayment: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/capsule-cancel", () => ({ withoutDrawnCapsuleUnits: async (_db: unknown, movements: unknown[]) => movements }));
vi.mock("@/lib/gift-cards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gift-cards")>()),
  issueGiftCardForOrder: mocks.issueGiftCardForOrder,
  redeemGiftCardForOrder: mocks.redeemGiftCardForOrder,
  handleGiftCardOnOrderCancellation: mocks.handleGiftCardOnOrderCancellation,
}));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: mocks.deliverGiftCard }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: mocks.createGuideForOrder }));
vi.mock("@/lib/inventory", () => ({ createInventoryMovementBatchResilient: mocks.createInventoryMovementBatchResilient }));
vi.mock("@/lib/order-inventory-issues", () => ({ recordInventoryIssues: mocks.recordInventoryIssues }));
vi.mock("@/lib/order-stock-movements", () => ({ explodeKitMovements: async (_tx: unknown, movements: unknown) => movements }));
vi.mock("@/lib/presale", () => ({
  settlePresaleLinesOnPayment: mocks.settlePresaleLinesOnPayment,
  releasePresaleLinesOnCancellation: mocks.releasePresaleLinesOnCancellation,
}));
vi.mock("@/lib/customer-benefits", () => ({
  markWelcomeBenefitRedeemed: mocks.markWelcomeBenefitRedeemed,
  releaseWelcomeBenefitReservation: mocks.releaseWelcomeBenefitReservation,
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: mocks.invalidateStoreProductsCache }));
vi.mock("@/lib/financial", () => ({ calculateOrderFinancials: mocks.calculateOrderFinancials }));
vi.mock("@/lib/google-analytics", () => ({ recordPaidOrderInGoogleAnalytics: mocks.recordPaidOrderInGoogleAnalytics }));
vi.mock("@/lib/late-payment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/late-payment")>()),
  flagPaymentOnCancelledOrder: mocks.flagPaymentOnCancelledOrder,
  notifyLatePaymentRevival: mocks.notifyLatePaymentRevival,
}));

import { POST as boldPOST } from "@/app/api/webhook/bold/route";
import { POST as wompiPOST } from "@/app/api/webhook/wompi/route";

type Status = OrderStatus;

/** Un pedido en memoria cuyo estado sí cambia con los `updateMany` con guarda, como en MySQL. */
function fakeDatabase(initial: Status) {
  const state = { status: initial };
  const matches = (where: any) => {
    const guard = where?.status;
    if (!guard) return true;
    if (typeof guard === "string") return guard === state.status;
    return Array.isArray(guard.in) && guard.in.includes(state.status);
  };
  const tx = {
    order: {
      update: vi.fn(),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!matches(where)) return { count: 0 };
        if (data.status) state.status = data.status;
        return { count: 1 };
      }),
    },
    coupon: { update: vi.fn(), updateMany: vi.fn() },
    paymentDetails: { upsert: vi.fn() },
    shipping: { upsert: vi.fn() },
  };
  mocks.transaction.mockImplementation(async (callback: any) => callback(tx));
  mocks.findUpdatedOrder.mockImplementation(async () => ({ id: "order-1", storeId: "store-1", status: state.status, shipping: null }));
  return { state, tx };
}

const line = { id: "item-1", productId: "product-1", quantity: 2, isPreorder: false, product: { acqPrice: 15000, price: 40000 } };

function baseOrder(method: PaymentMethod, status: Status, extra: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: "ORD-1",
    storeId: "store-1",
    userId: "user-1",
    fullName: "Clienta",
    type: OrderType.STANDARD,
    riskReasons: null,
    status,
    total: 80000,
    shippingCost: 7000,
    shipping: { cost: 5000, codFee: 1000 },
    payment: { method, details: null },
    coupon: { id: "coupon-1", isWelcomeBenefit: true },
    orderItems: [line],
    ...extra,
  };
}

const boldRequest = (type: string, data: Record<string, unknown>) =>
  new Request("https://admin.test/api/webhook/bold", {
    method: "POST",
    headers: { "content-type": "application/json", "x-bold-signature": "firma" },
    body: JSON.stringify({ type, data }),
  });

const boldApproved = (total = 80000) =>
  boldRequest("SALE_APPROVED", { amount: { currency: "COP", total }, metadata: { reference: "ORD-1" }, payment_id: "bold-tx" });

function wompiRequest(transaction: Record<string, unknown>) {
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const timestamp = 1700000000;
  const checksum = crypto
    .createHash("sha256")
    .update(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}wompi-events-key`)
    .digest("hex");
  return new Request("https://admin.test/api/webhook/wompi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "transaction.updated", data: { transaction }, signature: { properties, checksum }, timestamp }),
  });
}

const wompiTx = (status: string, amount = 8000000) => ({
  id: "wompi-tx",
  reference: "order-1",
  status,
  amount_in_cents: amount,
  currency: "COP",
  customer_email: "c@example.com",
  payment_method_type: "CARD",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventCreate.mockResolvedValue({ id: "evt-1" });
  mocks.eventUpdate.mockResolvedValue({});
  mocks.verifySignature.mockReturnValue(true);
  mocks.calculateOrderFinancials.mockResolvedValue({ netProfit: 1 });
  mocks.createInventoryMovementBatchResilient.mockResolvedValue({ success: [], failed: [] });
  mocks.recordInventoryIssues.mockResolvedValue(0);
  mocks.settlePresaleLinesOnPayment.mockResolvedValue(new Set());
  mocks.releasePresaleLinesOnCancellation.mockResolvedValue(new Set());
  mocks.issueGiftCardForOrder.mockResolvedValue(null);
  mocks.redeemGiftCardForOrder.mockResolvedValue(null);
  mocks.handleGiftCardOnOrderCancellation.mockResolvedValue(undefined);
  mocks.flagPaymentOnCancelledOrder.mockResolvedValue(undefined);
  mocks.notifyLatePaymentRevival.mockResolvedValue(undefined);
  mocks.findUpdatedOrder.mockImplementation(async () => null);
  mocks.redisKeys.clear();
  mocks.resendSend.mockResolvedValue({ data: { id: "email-1" }, error: null });
});

describe.each([
  ["Bold", PaymentMethod.Bold],
  ["Wompi", PaymentMethod.Wompi],
] as const)("webhook de %s: pago aprobado", (provider, method) => {
  const approve = () => (provider === "Bold" ? boldPOST(boldApproved()) : wompiPOST(wompiRequest(wompiTx("APPROVED"))));

  it("reclama desde CREATED/PENDING, descuenta, cierra finanzas y abre envío, una sola vez", async () => {
    const { state, tx } = fakeDatabase(OrderStatus.PENDING);
    const order = baseOrder(method, OrderStatus.PENDING);
    mocks.findOrder.mockResolvedValue(order);
    mocks.findUpdatedOrder.mockImplementation(async () => ({ ...order, status: state.status, shipping: { envioClickIdOrder: null, envioClickIdRate: "rate-1" } }));

    const first = await approve();
    expect(first.status).toBe(200);
    expect(state.status).toBe(OrderStatus.PAID);
    expect(tx.order.updateMany.mock.calls[0][0].where.status.in).toEqual(expect.arrayContaining([OrderStatus.CREATED, OrderStatus.PENDING]));
    expect(mocks.settlePresaleLinesOnPayment).toHaveBeenCalledWith(tx, "order-1");
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledWith(tx, [
      expect.objectContaining({ productId: "product-1", quantity: -2, type: "ORDER_PLACED", referenceId: "order-1", createdBy: provider === "Bold" ? "SYSTEM_BOLD" : "SYSTEM_WOMPI" }),
    ]);
    // Regla unificada 2: el envío de los financieros es `Shipping.cost + codFee`.
    expect(mocks.calculateOrderFinancials).toHaveBeenCalledWith(order, method, 6000, tx);
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: "order-1" }, data: expect.objectContaining({ netProfit: 1, paidAt: expect.any(Date) }) });
    expect(tx.coupon.update).toHaveBeenCalledWith({ where: { id: "coupon-1" }, data: { usedCount: { increment: 1 } } });
    expect(mocks.markWelcomeBenefitRedeemed).toHaveBeenCalledWith(tx, { couponId: "coupon-1", userId: "user-1", orderId: "order-1" });
    expect(tx.paymentDetails.upsert).toHaveBeenCalledTimes(1);
    expect(tx.shipping.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.issueGiftCardForOrder).toHaveBeenCalledWith(tx, expect.objectContaining({ orderId: "order-1" }));
    expect(mocks.redeemGiftCardForOrder).toHaveBeenCalledWith(tx, order, provider === "Bold" ? "SYSTEM_BOLD" : "SYSTEM_WOMPI");
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledWith("store-1", { orderIds: ["order-1"] });
    expect(mocks.recordPaidOrderInGoogleAnalytics).toHaveBeenCalledWith("order-1");
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith("order-1", OrderStatus.PAID);
    expect(mocks.waitUntil).toHaveBeenCalled();
    await Promise.all(mocks.waitUntil.mock.calls.map(([promise]) => promise));
    expect(mocks.createGuideForOrder).toHaveBeenCalledWith("order-1", "store-1");

    // Repetir la entrega con el pedido ya pagado no vuelve a descontar.
    mocks.findOrder.mockResolvedValue({ ...order, status: OrderStatus.PAID });
    const second = await approve();
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ message: "Orden ORD-1 ya fue procesada anteriormente" });
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledTimes(1);
    expect(mocks.sendOrderEmail).toHaveBeenCalledTimes(1);
  });

  it("si una línea no tiene stock, el pedido queda pagado con la incidencia DECREMENT", async () => {
    const { state, tx } = fakeDatabase(OrderStatus.PENDING);
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.PENDING));
    const failed = [{ productId: "product-1", quantity: -2, productName: "Agenda", reason: "Stock insuficiente. Disponible: 0" }];
    mocks.createInventoryMovementBatchResilient.mockResolvedValue({ success: [], failed });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect((await approve()).status).toBe(200);
    expect(state.status).toBe(OrderStatus.PAID);
    expect(mocks.recordInventoryIssues).toHaveBeenCalledWith(tx, {
      storeId: "store-1",
      orderId: "order-1",
      orderNumber: "ORD-1",
      kind: OrderInventoryIssueKind.DECREMENT,
      failed,
      notifyShortfall: true,
    });
  });

  it("una línea de preventa no descuenta hasta que la campaña se libera", async () => {
    const { tx } = fakeDatabase(OrderStatus.PENDING);
    const presale = { ...line, id: "item-2", productId: "product-2", isPreorder: true };
    const released = { ...line, id: "item-3", productId: "product-3", isPreorder: true };
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.PENDING, { orderItems: [line, presale, released] }));
    mocks.settlePresaleLinesOnPayment.mockResolvedValue(new Set(["item-3"]));

    await approve();
    const movements = mocks.createInventoryMovementBatchResilient.mock.calls[0][1];
    expect(movements.map((movement: any) => movement.productId)).toEqual(["product-1", "product-3"]);
    expect(mocks.createInventoryMovementBatchResilient.mock.calls[0][0]).toBe(tx);
  });

  it("una tarjeta de regalo cancelada no revive: se marca el pago en cancelado", async () => {
    const { state } = fakeDatabase(OrderStatus.CANCELLED);
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.CANCELLED, { type: OrderType.GIFT_CARD }));

    const response = await approve();
    expect(response.status).toBe(200);
    expect(state.status).toBe(OrderStatus.CANCELLED);
    expect(mocks.createInventoryMovementBatchResilient).not.toHaveBeenCalled();
    expect(mocks.issueGiftCardForOrder).not.toHaveBeenCalled();
    expect(mocks.flagPaymentOnCancelledOrder).toHaveBeenCalledWith("order-1", provider);
  });

  it("un pedido cancelado como fraude no revive", async () => {
    const { state } = fakeDatabase(OrderStatus.CANCELLED);
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.CANCELLED, { riskReasons: "fraude-confirmado" }));
    await approve();
    expect(state.status).toBe(OrderStatus.CANCELLED);
    expect(mocks.flagPaymentOnCancelledOrder).toHaveBeenCalledWith("order-1", provider);
  });

  it("regla unificada 1: un pedido normal cancelado revive con el pago tardío y se avisa", async () => {
    const { state } = fakeDatabase(OrderStatus.CANCELLED);
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.CANCELLED));

    expect((await approve()).status).toBe(200);
    expect(state.status).toBe(OrderStatus.PAID);
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledTimes(1);
    expect(mocks.flagPaymentOnCancelledOrder).not.toHaveBeenCalled();
    await Promise.all(mocks.waitUntil.mock.calls.map(([promise]) => promise));
    expect(mocks.notifyLatePaymentRevival).toHaveBeenCalledWith({ orderId: "order-1", provider, stockShortfall: 0 });
  });

  it("regla unificada 1: revivir sin stock deja el pedido pagado, con la incidencia y un solo correo que dice «pagado sin stock»", async () => {
    const { state, tx } = fakeDatabase(OrderStatus.CANCELLED);
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.CANCELLED));
    const failed = [{ productId: "product-1", quantity: -2, productName: "Agenda", reason: "Stock insuficiente. Disponible: 0" }];
    mocks.createInventoryMovementBatchResilient.mockResolvedValue({ success: [], failed });
    mocks.recordInventoryIssues.mockResolvedValue(1);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await approve()).status).toBe(200);
    expect(state.status).toBe(OrderStatus.PAID);
    expect(mocks.recordInventoryIssues).toHaveBeenCalledWith(tx, expect.objectContaining({ kind: OrderInventoryIssueKind.DECREMENT, failed, notifyShortfall: false }));
    await Promise.all(mocks.waitUntil.mock.calls.map(([promise]) => promise));
    expect(mocks.notifyLatePaymentRevival).toHaveBeenCalledTimes(1);
    expect(mocks.notifyLatePaymentRevival).toHaveBeenCalledWith({ orderId: "order-1", provider, stockShortfall: 1 });
  });
});

describe.each([
  ["Bold", PaymentMethod.Bold],
  ["Wompi", PaymentMethod.Wompi],
] as const)("webhook de %s: rechazo y anulación", (provider, method) => {
  const decline = () =>
    provider === "Bold"
      ? boldPOST(boldRequest("SALE_REJECTED", { metadata: { reference: "ORD-1" }, payment_id: "bold-tx" }))
      : wompiPOST(wompiRequest(wompiTx("DECLINED")));
  const voidPaid = () =>
    provider === "Bold"
      ? boldPOST(boldRequest("VOID_APPROVED", { metadata: { reference: "ORD-1" }, payment_id: "bold-tx" }))
      : wompiPOST(wompiRequest(wompiTx("VOIDED")));

  it("un rechazo sobre un pendiente cancela sin reingresar stock ni tocar el cupón", async () => {
    const { state, tx } = fakeDatabase(OrderStatus.PENDING);
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.PENDING));

    expect((await decline()).status).toBe(200);
    expect(state.status).toBe(OrderStatus.CANCELLED);
    expect(mocks.createInventoryMovementBatchResilient).not.toHaveBeenCalled();
    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
    expect(mocks.handleGiftCardOnOrderCancellation).toHaveBeenCalledWith(tx, expect.objectContaining({ orderId: "order-1" }));
    expect(mocks.releaseWelcomeBenefitReservation).toHaveBeenCalledWith(tx, { couponId: "coupon-1", userId: "user-1", orderId: "order-1" });
    expect(tx.paymentDetails.upsert).toHaveBeenCalledTimes(1);
    expect(tx.shipping.upsert).not.toHaveBeenCalled();
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith("order-1", OrderStatus.CANCELLED);
  });

  it("anular un pagado reingresa una vez, borra paidAt y conserva el cupón (regla unificada 4)", async () => {
    const { state, tx } = fakeDatabase(OrderStatus.PAID);
    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.PAID));

    expect((await voidPaid()).status).toBe(200);
    expect(state.status).toBe(OrderStatus.CANCELLED);
    expect(tx.order.updateMany.mock.calls[0][0]).toEqual({ where: { id: "order-1", status: OrderStatus.PAID }, data: { status: OrderStatus.CANCELLED, paidAt: null } });
    expect(mocks.releasePresaleLinesOnCancellation).toHaveBeenCalledWith(tx, "order-1");
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledWith(tx, [expect.objectContaining({ productId: "product-1", quantity: 2, type: "ORDER_CANCELLED" })]);
    expect(tx.coupon.updateMany).toHaveBeenCalledWith({ where: { id: "coupon-1", usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(mocks.invalidateStoreProductsCache).toHaveBeenCalledWith("store-1", { orderIds: ["order-1"] });

    mocks.findOrder.mockResolvedValue(baseOrder(method, OrderStatus.CANCELLED));
    const again = await voidPaid();
    await expect(again.json()).resolves.toEqual({ message: "Orden ORD-1 ya fue procesada anteriormente" });
    expect(mocks.createInventoryMovementBatchResilient).toHaveBeenCalledTimes(1);
  });
});

describe("Bold: rechazos con firma válida", () => {
  it("pedido no encontrado responde 404", async () => {
    mocks.findOrder.mockResolvedValue(null);
    const response = await boldPOST(boldApproved());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Orden no encontrada: ORD-1" });
  });

  it("método distinto responde 400 sin transacción", async () => {
    mocks.findOrder.mockResolvedValue(baseOrder(PaymentMethod.Wompi, OrderStatus.PENDING));
    const response = await boldPOST(boldApproved());
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("monto distinto responde 400 sin transacción", async () => {
    mocks.findOrder.mockResolvedValue(baseOrder(PaymentMethod.Bold, OrderStatus.PENDING));
    const response = await boldPOST(boldApproved(1000));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "El monto de Bold no coincide con la orden ORD-1" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("la respuesta de un pago aplicado sigue siendo { success, orderId }", async () => {
    fakeDatabase(OrderStatus.PENDING);
    mocks.findOrder.mockResolvedValue(baseOrder(PaymentMethod.Bold, OrderStatus.PENDING));
    const response = await boldPOST(boldApproved());
    await expect(response.json()).resolves.toEqual({ success: true, orderId: "order-1" });
  });
});

describe("Wompi: estados intermedios y fallos", () => {
  it("PENDING sobre CREATED pasa a PENDING con el comprobante y sin envío", async () => {
    const { state, tx } = fakeDatabase(OrderStatus.CREATED);
    mocks.findOrder.mockResolvedValue(baseOrder(PaymentMethod.Wompi, OrderStatus.CREATED));
    mocks.findUpdatedOrder.mockImplementation(async () => ({ ...baseOrder(PaymentMethod.Wompi, state.status), shipping: null }));

    const response = await wompiPOST(wompiRequest(wompiTx("PENDING")));
    expect(response.status).toBe(200);
    expect(state.status).toBe(OrderStatus.PENDING);
    expect(tx.paymentDetails.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { transactionId: "wompi-tx", details: "customer_email: c@example.com | payment_method_type: CARD" } }));
    expect(tx.shipping.upsert).not.toHaveBeenCalled();
    expect(mocks.createInventoryMovementBatchResilient).not.toHaveBeenCalled();
    expect(mocks.sendOrderEmail).toHaveBeenCalledWith("order-1", OrderStatus.PENDING);
  });

  it("PENDING sobre un pedido ya PENDING no hace nada", async () => {
    const { tx } = fakeDatabase(OrderStatus.PENDING);
    mocks.findOrder.mockResolvedValue(baseOrder(PaymentMethod.Wompi, OrderStatus.PENDING));
    const response = await wompiPOST(wompiRequest(wompiTx("PENDING")));
    await expect(response.json()).resolves.toEqual({ message: "Orden ORD-1 ya fue procesada anteriormente" });
    expect(tx.paymentDetails.upsert).not.toHaveBeenCalled();
    expect(mocks.sendOrderEmail).not.toHaveBeenCalled();
  });

  it("si la base falla al buscar el pedido responde 500 (antes 400) para que Wompi reintente", async () => {
    mocks.findOrder.mockRejectedValue(new Error("db down"));
    const response = await wompiPOST(wompiRequest(wompiTx("APPROVED")));
    expect(response.status).toBe(500);
  });

  it("el pago aplicado responde 200 sin cuerpo, como siempre", async () => {
    fakeDatabase(OrderStatus.PENDING);
    mocks.findOrder.mockResolvedValue(baseOrder(PaymentMethod.Wompi, OrderStatus.PENDING));
    const response = await wompiPOST(wompiRequest(wompiTx("APPROVED")));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("null");
  });
});

describe("avisos de webhooks de pago (producción)", () => {
  beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"));
  afterEach(() => vi.unstubAllEnvs());

  const settle = () => Promise.all(mocks.waitUntil.mock.calls.map(([promise]) => promise));

  it("un rechazo auténtico (pedido no encontrado) avisa una vez por hora", async () => {
    mocks.findOrder.mockResolvedValue(null);
    await boldPOST(boldApproved());
    await boldPOST(boldApproved());
    await settle();
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    const email = mocks.resendSend.mock.calls[0][0];
    expect(email.subject).toBe("⚠️ Aviso de pago de Bold sin aplicar");
    expect(email.react).toBeTruthy();
    expect(email.text).toContain("Orden no encontrada: ORD-1");
  });

  it("un 500 de Wompi (base caída) avisa", async () => {
    mocks.findOrder.mockRejectedValue(new Error("db down"));
    await wompiPOST(wompiRequest(wompiTx("APPROVED")));
    await settle();
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend.mock.calls[0][0].subject).toBe("⚠️ El webhook de Wompi está fallando");
  });

  it("una firma inválida con basura o referencia inventada no avisa ni anota pedido", async () => {
    mocks.verifySignature.mockReturnValue(false);
    mocks.findOrder.mockResolvedValue(null);
    await boldPOST(new Request("https://admin.test/api/webhook/bold", { method: "POST", headers: { "x-bold-signature": "x" }, body: "<?php" }));
    await boldPOST(boldApproved());
    await settle();
    expect(mocks.resendSend).not.toHaveBeenCalled();
    expect(mocks.eventUpdate.mock.calls.every(([call]) => call.data.orderId === undefined)).toBe(true);
  });

  it("una firma inválida cuya referencia es un pedido real avisa y deja el pedido en la fila", async () => {
    mocks.verifySignature.mockReturnValue(false);
    mocks.findOrder.mockResolvedValue({ id: "order-1", storeId: "store-1", orderNumber: "ORD-1" });
    await boldPOST(boldApproved());
    await settle();
    expect(mocks.eventUpdate).toHaveBeenCalledWith({ where: { id: "evt-1" }, data: { orderId: "order-1", storeId: "store-1", orderReference: "ORD-1" } });
    expect(mocks.resendSend).toHaveBeenCalledTimes(1);
    expect(mocks.resendSend.mock.calls[0][0].subject).toBe("⚠️ Firma inválida en un aviso de Bold");
  });

  it("un cuerpo de Wompi que no es JSON (sondeo) no avisa", async () => {
    await wompiPOST(new Request("https://admin.test/api/webhook/wompi", { method: "POST", body: "nope" }));
    await settle();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });

  it("un pago aplicado no avisa", async () => {
    fakeDatabase(OrderStatus.PENDING);
    mocks.findOrder.mockResolvedValue(baseOrder(PaymentMethod.Bold, OrderStatus.PENDING));
    await boldPOST(boldApproved());
    await settle();
    expect(mocks.resendSend).not.toHaveBeenCalled();
  });
});
