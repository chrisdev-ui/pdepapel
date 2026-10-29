import { OrderPaymentKind, OrderPaymentStatus, OrderStatus } from "@prisma/client";

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
      payment: { select: { method: true } },
      shipping: { select: { cost: true } },
      status: true,
      total: true,
    },
  });

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
      body: JSON.stringify(payload),
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
