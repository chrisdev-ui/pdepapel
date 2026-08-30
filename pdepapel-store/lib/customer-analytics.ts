import { track as trackVercelEvent } from "@vercel/analytics/react";

import { hasAnalyticsConsent } from "@/lib/analytics-consent";
import { trackMicrosoftClarityEvent } from "@/lib/microsoft-clarity";
import { getStructuredProductSize } from "@/lib/product-options";
import { Product } from "@/types";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...arguments_: unknown[]) => void;
  }
}

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price: number;
  quantity?: number;
}

export type AnalyticsEventParameters = Record<string, unknown>;

const GOOGLE_ANALYTICS_SCRIPT_ID = "pdepapel-google-analytics";

function getProductPrice(product: Product): number {
  const candidates = [
    product.discountedPrice,
    product.minPrice,
    Number(product.price),
  ];

  return candidates.find((candidate) => Number.isFinite(candidate)) ?? 0;
}

function getProductVariant(product: Product): string | undefined {
  const parts = [
    product.design?.name,
    product.color?.name,
    getStructuredProductSize(product),
  ]
    .filter(Boolean)
    .join(" · ");

  return parts || undefined;
}

export function toAnalyticsItem(
  product: Product,
  quantity?: number,
): AnalyticsItem {
  return {
    item_id: product.sku || product.id,
    item_name: product.name,
    item_brand: product.brand || undefined,
    item_category: product.category?.name,
    item_variant: getProductVariant(product),
    price: getProductPrice(product),
    ...(quantity !== undefined ? { quantity } : {}),
  };
}

export function getAnalyticsValue(items: AnalyticsItem[]): number {
  return items.reduce(
    (total, item) => total + item.price * (item.quantity ?? 1),
    0,
  );
}

function ensureGoogleTag(): void {
  window.dataLayer ||= [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      window.dataLayer?.push(arguments);
    };
  }
}

function appendScript(id: string, src: string): void {
  if (document.getElementById(id)) return;

  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function clearCookie(cookieName: string): void {
  document.cookie = `${cookieName}=; Max-Age=0; path=/; SameSite=Lax`;
}

export function enableGoogleAnalytics(measurementId: string): void {
  if (!measurementId) return;

  ensureGoogleTag();
  window.gtag?.("js", new Date());
  window.gtag?.("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  window.gtag?.("consent", "update", {
    analytics_storage: "granted",
  });
  window.gtag?.("config", measurementId, {
    anonymize_ip: true,
    send_page_view: false,
  });
  appendScript(
    GOOGLE_ANALYTICS_SCRIPT_ID,
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`,
  );
}

export function disableGoogleAnalytics(): void {
  window.gtag?.("consent", "update", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });

  if (typeof document === "undefined") return;
  for (const cookie of document.cookie.split(";")) {
    const cookieName = cookie.trim().split("=")[0];
    if (cookieName === "_ga" || cookieName.startsWith("_ga_")) {
      clearCookie(cookieName);
    }
  }
}

export function trackCustomerEvent(
  eventName: string,
  parameters: AnalyticsEventParameters = {},
): void {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return;

  const vercelParameters: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      vercelParameters[key] = value;
    }
  }
  trackVercelEvent(eventName, vercelParameters);
  window.gtag?.("event", eventName, parameters);
  trackMicrosoftClarityEvent(eventName, parameters);
}

export function trackGooglePageView(path: string, title: string): void {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return;

  window.gtag?.("event", "page_view", {
    page_location: window.location.href,
    page_path: path,
    page_title: title,
  });
}

export function getGoogleAnalyticsClientId(
  measurementId: string,
): Promise<string | null> {
  if (
    typeof window === "undefined" ||
    !measurementId ||
    !hasAnalyticsConsent() ||
    !window.gtag
  ) {
    return Promise.resolve(null);
  }

  const gtag = window.gtag;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (clientId: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(clientId);
    };
    const timeoutId = window.setTimeout(() => settle(null), 250);

    gtag("get", measurementId, "client_id", (clientId: unknown) => {
      settle(typeof clientId === "string" ? clientId : null);
    });
  });
}
