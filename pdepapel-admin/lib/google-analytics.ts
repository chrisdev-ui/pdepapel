import { OrderPaymentKind, OrderPaymentPlan, OrderPaymentStatus, OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";

const GOOGLE_ANALYTICS_MEASUREMENT_PROTOCOL_URL =
  "https://www.google-analytics.com/mp/collect";

export interface GoogleAnalyticsPurchaseItem {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  price: number;
  quantity: number;
}

export interface GoogleAnalyticsPurchasePayload {
  client_id: string;
  events: Array<{
    name: "purchase";
    params: {
      currency: "COP";
      engagement_time_msec: number;
      session_id?: string;
      items: GoogleAnalyticsPurchaseItem[];
      payment_type?: string;
      shipping: number;
      transaction_id: string;
      value: number;
      coupon?: string;
    };
  }>;
}

export function normalizeGoogleAnalyticsClientId(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;

  const clientId = value.trim();
  return /^\d{1,20}\.\d{1,20}$/.test(clientId) ? clientId : null;
}

/** session_id de GA4: solo dígitos (gtag lo entrega como número). */
export function normalizeGoogleAnalyticsSessionId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const sessionId = String(value).trim();
  return /^\d{1,20}$/.test(sessionId) ? sessionId : null;
}

export function buildGoogleAnalyticsPurchasePayload(input: {
  clientId: string;
  /** Sin él GA4 no une la compra a la sesión y la cuenta como «Unassigned». */
  sessionId?: string | null;
  couponCode?: string | null;
  orderNumber: string;
  paymentMethod?: string | null;
  shippingCost?: number | null;
  total: number;
  items: Array<{
    name: string;
    price: number;
    brandName?: string | null;
    product?: {
      category?: { name: string } | null;
      sku: string;
    } | null;
    productId?: string | null;
    quantity: number;
    sku?: string | null;
  }>;
}): GoogleAnalyticsPurchasePayload {
  return {
    client_id: input.clientId,
    events: [
      {
        name: "purchase",
        params: {
          currency: "COP",
          engagement_time_msec: 1,
          ...(input.sessionId ? { session_id: input.sessionId } : {}),
          items: input.items.map((item) => ({
            item_id: item.sku || item.product?.sku || item.productId || "manual",
            item_name: item.name,
            // La marca que tenía la línea al venderse (`OrderItem.brandName`).
            item_brand: item.brandName || undefined,
            item_category: item.product?.category?.name,
            price: Number(item.price),
            quantity: item.quantity,
          })),
          payment_type: input.paymentMethod || undefined,
          shipping: Number(input.shippingCost ?? 0),
          transaction_id: input.orderNumber,
          value: Number(input.total),
          coupon: input.couponCode || undefined,
        },
      },
    ],
  };
}

export async function recordPaidOrderInGoogleAnalytics(
  orderId: string,
): Promise<"sent" | "skipped"> {
  const measurementId = env.GA4_MEASUREMENT_ID;
  const apiSecret = env.GA4_API_SECRET;

  if (!measurementId || !apiSecret) return "skipped";

  const order = await prismadb.order.findUnique({
    where: { id: orderId },
    select: {
      analyticsClientId: true,
      analyticsSessionId: true,
      analyticsPurchaseTrackedAt: true,
      coupon: { select: { code: true } },
      id: true,
      orderItems: {
        select: {
          name: true,
          price: true,
          brandName: true,
          product: {
            select: {
              category: { select: { name: true } },
              sku: true,
            },
          },
          productId: true,
          quantity: true,
          sku: true,
        },
      },
      orderNumber: true,
      paymentPlan: true,
      payment: { select: { method: true } },
      // El saldo de una preventa: lo que cerró la venta (en línea o anotado por Paula).
      payments: {
        where: { kind: OrderPaymentKind.BALANCE, status: OrderPaymentStatus.APPROVED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { amount: true, method: true },
      },
      shipping: { select: { cost: true } },
      status: true,
      total: true,
    },
  });

  // Cash on delivery: the purchase already went out when the order was created
  // and the ids were kept for a possible refund. Payment on delivery ends that
  // window, so the ids go now; nothing is sent twice.
  if (order?.status === OrderStatus.PAID && order.analyticsPurchaseTrackedAt && order.analyticsClientId) {
    await clearGoogleAnalyticsIds(order.id);
    return "skipped";
  }

  if (
    !order ||
    order.status !== OrderStatus.PAID ||
    order.analyticsPurchaseTrackedAt ||
    !order.analyticsClientId
  ) {
    return "skipped";
  }

  const clientId = normalizeGoogleAnalyticsClientId(order.analyticsClientId);
  if (!clientId) return "skipped";

  const payload = buildGoogleAnalyticsPurchasePayload({
    clientId,
    sessionId: normalizeGoogleAnalyticsSessionId(order.analyticsSessionId),
    couponCode: order.coupon?.code,
    items: order.orderItems,
    orderNumber: order.orderNumber,
    paymentMethod: order.payment?.method,
    shippingCost: order.shipping?.cost,
    total: order.total,
  });
  const body =
    order.paymentPlan === OrderPaymentPlan.DEPOSIT
      ? { ...payload, events: [...payload.events, buildPreorderBalancePaidEvent(payload.events[0].params, order.orderNumber, order.payments[0] ?? null)] }
      : payload;
  const query = new URLSearchParams({
    api_secret: apiSecret,
    measurement_id: measurementId,
  });
  const response = await fetch(
    `${GOOGLE_ANALYTICS_MEASUREMENT_PROTOCOL_URL}?${query.toString()}`,
    {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3_000),
    },
  );

  if (!response.ok) {
    throw new Error(`GA4 Measurement Protocol respondió ${response.status}`);
  }

  await prismadb.order.updateMany({
    where: {
      analyticsClientId: order.analyticsClientId,
      analyticsPurchaseTrackedAt: null,
      id: order.id,
    },
    data: {
      analyticsClientId: null,
      analyticsSessionId: null,
      analyticsPurchaseTrackedAt: new Date(),
    },
  });

  return "sent";
}

/**
 * «preorder_balance_paid»: va en la misma llamada que `purchase` de una
 * preventa con anticipo, así se marca una sola vez (`analyticsPurchaseTrackedAt`).
 * `value` es el saldo que cerró la venta (0 si se pagó todo con abonos).
 */
export function buildPreorderBalancePaidEvent(
  purchaseParams: Record<string, unknown>,
  orderNumber: string,
  balance: { amount: number; method: string } | null,
) {
  return {
    name: "preorder_balance_paid",
    params: {
      currency: "COP",
      engagement_time_msec: 1,
      ...(purchaseParams.session_id ? { session_id: purchaseParams.session_id } : {}),
      order_number: orderNumber,
      value: Math.round(Number(balance?.amount ?? 0)),
      payment_type: balance?.method || undefined,
    },
  };
}

/**
 * «preorder_deposit_paid»: el anticipo de una preventa, por Measurement
 * Protocol. NO es `purchase` (la venta se cuenta una vez, al pagar el saldo) y
 * por eso conserva `analyticsClientId`: la compra del saldo lo necesita.
 */
export async function recordDepositInGoogleAnalytics(orderId: string): Promise<"sent" | "skipped"> {
  const measurementId = env.GA4_MEASUREMENT_ID;
  const apiSecret = env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) return "skipped";

  const order = await prismadb.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      depositAmount: true,
      analyticsClientId: true,
      analyticsSessionId: true,
      analyticsDepositTrackedAt: true,
      // El primer cobro aprobado: lo que de verdad entró (puede ser más que el anticipo).
      payments: {
        where: { kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { amount: true },
      },
      orderItems: {
        select: {
          name: true,
          price: true,
          brandName: true,
          product: { select: { category: { select: { name: true } }, sku: true } },
          productId: true,
          quantity: true,
          sku: true,
        },
      },
    },
  });
  if (!order || order.status !== OrderStatus.DEPOSIT_PAID || order.analyticsDepositTrackedAt || !order.analyticsClientId) {
    return "skipped";
  }
  const clientId = normalizeGoogleAnalyticsClientId(order.analyticsClientId);
  if (!clientId) return "skipped";

  const base = buildGoogleAnalyticsPurchasePayload({
    clientId,
    sessionId: normalizeGoogleAnalyticsSessionId(order.analyticsSessionId),
    items: order.orderItems,
    orderNumber: `${order.orderNumber}-A`,
    total: Number(order.payments[0]?.amount ?? order.depositAmount ?? 0),
  });
  const { coupon: _coupon, shipping: _shipping, payment_type: _paymentType, ...params } = base.events[0].params as Record<string, unknown>;
  const payload = { ...base, events: [{ name: "preorder_deposit_paid", params }] };

  const query = new URLSearchParams({ api_secret: apiSecret, measurement_id: measurementId });
  const response = await fetch(`${GOOGLE_ANALYTICS_MEASUREMENT_PROTOCOL_URL}?${query.toString()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`GA4 Measurement Protocol respondió ${response.status}`);

  await prismadb.order.updateMany({
    where: { id: order.id, analyticsDepositTrackedAt: null },
    data: { analyticsDepositTrackedAt: new Date() },
  });
  return "sent";
}

async function clearGoogleAnalyticsIds(orderId: string): Promise<void> {
  await prismadb.order.updateMany({
    where: { id: orderId },
    data: { analyticsClientId: null, analyticsSessionId: null },
  });
}

async function postMeasurementProtocol(body: unknown): Promise<void> {
  const measurementId = env.GA4_MEASUREMENT_ID;
  const apiSecret = env.GA4_API_SECRET;
  if (!measurementId || !apiSecret) throw new Error("GA4 sin configurar");
  const query = new URLSearchParams({ api_secret: apiSecret, measurement_id: measurementId });
  const response = await fetch(`${GOOGLE_ANALYTICS_MEASUREMENT_PROTOCOL_URL}?${query.toString()}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`GA4 Measurement Protocol respondió ${response.status}`);
}

const COD_ANALYTICS_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  analyticsClientId: true,
  analyticsSessionId: true,
  analyticsPurchaseTrackedAt: true,
  analyticsRefundTrackedAt: true,
  coupon: { select: { code: true } },
  payment: { select: { method: true } },
  shipping: { select: { cost: true, status: true } },
  orderItems: {
    select: {
      name: true,
      price: true,
      brandName: true,
      product: { select: { category: { select: { name: true } }, sku: true } },
      productId: true,
      quantity: true,
      sku: true,
    },
  },
} as const;

/**
 * Contra entrega: la compra va a GA4 al crear el pedido (no espera el cobro
 * al entregar, que puede no marcarse nunca), con `payment_type: "cod"`. Solo
 * con consentimiento (hay client id). Se reclama `analyticsPurchaseTrackedAt`
 * antes de mandar, así dos llamadas a la vez no la mandan dos veces; si GA4
 * falla se suelta el reclamo. Los ids se quedan: un `refund` los necesita si
 * el pedido se cancela antes de entregar.
 */
export async function recordCodOrderInGoogleAnalytics(orderId: string): Promise<"sent" | "skipped"> {
  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) return "skipped";
  const order = await prismadb.order.findUnique({ where: { id: orderId }, select: COD_ANALYTICS_SELECT });
  if (
    !order ||
    order.payment?.method !== PaymentMethod.COD ||
    order.status === OrderStatus.CANCELLED ||
    order.analyticsPurchaseTrackedAt ||
    !order.analyticsClientId
  ) {
    return "skipped";
  }
  const clientId = normalizeGoogleAnalyticsClientId(order.analyticsClientId);
  if (!clientId) return "skipped";

  const claimedAt = new Date();
  const claim = await prismadb.order.updateMany({
    where: { id: order.id, analyticsPurchaseTrackedAt: null },
    data: { analyticsPurchaseTrackedAt: claimedAt },
  });
  if (claim.count === 0) return "skipped";

  try {
    await postMeasurementProtocol(
      buildGoogleAnalyticsPurchasePayload({
        clientId,
        sessionId: normalizeGoogleAnalyticsSessionId(order.analyticsSessionId),
        couponCode: order.coupon?.code,
        items: order.orderItems,
        orderNumber: order.orderNumber,
        paymentMethod: "cod",
        shippingCost: order.shipping?.cost,
        total: order.total,
      }),
    );
  } catch (error) {
    await prismadb.order.updateMany({
      where: { id: order.id, analyticsPurchaseTrackedAt: claimedAt },
      data: { analyticsPurchaseTrackedAt: null },
    });
    throw error;
  }
  return "sent";
}

/**
 * The GA4 `refund` body for a cash-on-delivery order whose purchase already
 * went out and that never reached the customer, or null when none is owed.
 * `beforeDelete`: the order is about to be deleted, so CANCELLED is not required.
 */
export async function buildCodRefundBody(
  orderId: string,
  options: { beforeDelete?: boolean } = {},
): Promise<{ client_id: string; events: Array<{ name: "refund"; params: Record<string, unknown> }> } | null> {
  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) return null;
  const order = await prismadb.order.findUnique({ where: { id: orderId }, select: COD_ANALYTICS_SELECT });
  if (
    !order ||
    order.payment?.method !== PaymentMethod.COD ||
    (!options.beforeDelete && order.status !== OrderStatus.CANCELLED) ||
    !order.analyticsPurchaseTrackedAt ||
    order.analyticsRefundTrackedAt ||
    !order.analyticsClientId ||
    order.shipping?.status === ShippingStatus.Delivered
  ) {
    return null;
  }
  const clientId = normalizeGoogleAnalyticsClientId(order.analyticsClientId);
  if (!clientId) return null;
  const sessionId = normalizeGoogleAnalyticsSessionId(order.analyticsSessionId);
  return {
    client_id: clientId,
    events: [
      {
        name: "refund",
        params: {
          currency: "COP",
          engagement_time_msec: 1,
          ...(sessionId ? { session_id: sessionId } : {}),
          transaction_id: order.orderNumber,
          value: Number(order.total),
          payment_type: "cod",
        },
      },
    ],
  };
}

/** Sends a body built earlier (a deleted order has no row left to read). */
export async function sendGoogleAnalyticsRefund(body: NonNullable<Awaited<ReturnType<typeof buildCodRefundBody>>>): Promise<void> {
  await postMeasurementProtocol(body);
}

/**
 * Contra entrega cancelado antes de entregar, con la compra ya en GA4: un
 * `refund` por el total, una sola vez (`analyticsRefundTrackedAt`, aunque el
 * pedido se reactive después). Al mandarlo se borran los ids.
 */
export async function recordCancelledCodOrderInGoogleAnalytics(orderId: string): Promise<"sent" | "skipped"> {
  const body = await buildCodRefundBody(orderId);
  if (!body) return "skipped";

  const claimedAt = new Date();
  const claim = await prismadb.order.updateMany({
    where: { id: orderId, analyticsRefundTrackedAt: null },
    data: { analyticsRefundTrackedAt: claimedAt },
  });
  if (claim.count === 0) return "skipped";

  try {
    await postMeasurementProtocol(body);
  } catch (error) {
    await prismadb.order.updateMany({
      where: { id: orderId, analyticsRefundTrackedAt: claimedAt },
      data: { analyticsRefundTrackedAt: null },
    });
    throw error;
  }
  await clearGoogleAnalyticsIds(orderId);
  return "sent";
}
