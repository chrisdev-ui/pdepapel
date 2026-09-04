import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/consent/route";
import {
  ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS,
  ANALYTICS_CONSENT_COOKIE_NAME,
  readAnalyticsConsentFromCookieHeader,
} from "@/lib/analytics-consent";

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("consent cookie route", () => {
  it("sets a long-lived, non-HttpOnly, same-site cookie with the decision", async () => {
    const response = await post({
      analytics: true,
      updatedAt: "2026-09-04T15:16:52.640Z",
    });
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(setCookie).toContain(`${ANALYTICS_CONSENT_COOKIE_NAME}=`);
    expect(setCookie).toContain(
      `Max-Age=${ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS}`,
    );
    expect(setCookie).toMatch(/path=\//i);
    expect(setCookie).toMatch(/samesite=lax/i);
    expect(setCookie).not.toMatch(/httponly/i);
    expect(readAnalyticsConsentFromCookieHeader(setCookie)).toEqual({
      analytics: true,
      updatedAt: "2026-09-04T15:16:52.640Z",
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      consent: { analytics: true, updatedAt: "2026-09-04T15:16:52.640Z" },
    });
  });

  it("stores a rejection the same way so the visitor is not asked again", async () => {
    const response = await post({ analytics: false });
    const cookie = readAnalyticsConsentFromCookieHeader(
      response.headers.get("set-cookie"),
    );

    expect(response.status).toBe(200);
    expect(cookie?.analytics).toBe(false);
    expect(Number.isNaN(Date.parse(cookie?.updatedAt ?? ""))).toBe(false);
  });

  it("replaces an invalid timestamp with the current time", async () => {
    const response = await post({ analytics: true, updatedAt: "ayer" });
    const cookie = readAnalyticsConsentFromCookieHeader(
      response.headers.get("set-cookie"),
    );

    expect(response.status).toBe(200);
    expect(Number.isNaN(Date.parse(cookie?.updatedAt ?? ""))).toBe(false);
  });

  it("rejects bodies without a boolean decision", async () => {
    for (const body of [
      { analytics: "yes" },
      {},
      null,
      "not json",
      [true],
    ]) {
      const response = await post(body);

      expect(response.status).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("rejects cross-site requests", async () => {
    const response = await post(
      { analytics: true },
      { "sec-fetch-site": "cross-site" },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
