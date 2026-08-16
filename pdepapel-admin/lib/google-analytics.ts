import { OrderStatus } from "@prisma/client";

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

export function buildGoogleAnalyticsPurchasePayload(input: {
  clientId: string;
  couponCode?: string | null;
  orderNumber: string;
  paymentMethod?: string | null;
  shippingCost?: number | null;
  total: number;
  items: Array<{
    name: string;
    price: number;
    product?: {
      brand?: string | null;
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
          items: input.items.map((item) => ({
            item_id: item.sku || item.product?.sku || item.productId || "manual",
            item_name: item.name,
            item_brand: item.product?.brand || undefined,
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
      analyticsPurchaseTrackedAt: true,
      coupon: { select: { code: true } },
      id: true,
      orderItems: {
        select: {
          name: true,
          price: true,
          product: {
            select: {
              brand: true,
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
      analyticsPurchaseTrackedAt: new Date(),
    },
  });

  return "sent";
}
