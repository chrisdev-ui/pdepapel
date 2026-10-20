"use client";

import { Analytics } from "@vercel/analytics/react";

import { hasAnalyticsConsent } from "@/lib/analytics-consent";
import { redactAnalyticsUrl } from "@/lib/analytics-redaction";

type VercelAnalyticsEvent = { type: "pageview" | "event"; url: string };

/**
 * Vercel Analytics con la misma regla que GA4 y Clarity: nada sin permiso de
 * analítica, y la URL del recibo como `/pedido/[id]`.
 */
export function vercelAnalyticsBeforeSend<T extends VercelAnalyticsEvent>(event: T): T | null {
  if (!hasAnalyticsConsent()) return null;
  return { ...event, url: redactAnalyticsUrl(event.url) };
}

export function VercelAnalytics() {
  return <Analytics beforeSend={vercelAnalyticsBeforeSend} />;
}
