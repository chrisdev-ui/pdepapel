import { NextResponse } from "next/server";

import {
  ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS,
  ANALYTICS_CONSENT_COOKIE_NAME,
  parseAnalyticsConsent,
} from "@/lib/analytics-consent";

export const dynamic = "force-dynamic";

/**
 * Mirrors the visitor's analytics decision into a cookie set by the server.
 * Safari/iOS caps script-written storage (local storage, document.cookie) at
 * 7 days without a visit, but keeps cookies set in HTTP responses, so this
 * keeps returning visitors from being asked again. It stores only the boolean
 * decision and its timestamp: no identifiers, no personal data.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const candidate =
    body && typeof body === "object"
      ? (body as { analytics?: unknown; updatedAt?: unknown })
      : {};

  if (typeof candidate.analytics !== "boolean") {
    return NextResponse.json(
      { message: "Preferencia de analítica inválida" },
      { status: 400 },
    );
  }

  const updatedAt =
    typeof candidate.updatedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.updatedAt))
      ? candidate.updatedAt
      : new Date().toISOString();
  const consent = parseAnalyticsConsent({
    analytics: candidate.analytics,
    updatedAt,
  });

  if (!consent) {
    return NextResponse.json(
      { message: "Preferencia de analítica inválida" },
      { status: 400 },
    );
  }

  const response = NextResponse.json(
    { ok: true, consent },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: ANALYTICS_CONSENT_COOKIE_NAME,
    // NextResponse URL-encodes cookie values itself; the client decodes once.
    value: JSON.stringify(consent),
    maxAge: ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });

  return response;
}
