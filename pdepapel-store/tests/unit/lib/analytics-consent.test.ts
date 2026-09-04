// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANALYTICS_CONSENT_COOKIE_NAME,
  ANALYTICS_CONSENT_ENDPOINT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  hasAnalyticsConsent,
  readAnalyticsConsent,
  readAnalyticsConsentFromCookieHeader,
  saveAnalyticsConsent,
  serializeAnalyticsConsentCookie,
  syncAnalyticsConsentCookie,
} from "@/lib/analytics-consent";

const accepted = { analytics: true, updatedAt: "2026-08-27T17:52:42.293Z" };

function setConsentCookie(value: string) {
  document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=${value}; path=/`;
}

function clearConsentCookie() {
  document.cookie = `${ANALYTICS_CONSENT_COOKIE_NAME}=; Max-Age=0; path=/`;
}

describe("analytics consent persistence", () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));

  beforeEach(() => {
    window.localStorage.clear();
    clearConsentCookie();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses only the consent cookie and ignores malformed values", () => {
    const header = `_ga=GA1.1.1; ${ANALYTICS_CONSENT_COOKIE_NAME}=${serializeAnalyticsConsentCookie(accepted)}; other=1`;

    expect(readAnalyticsConsentFromCookieHeader(header)).toEqual(accepted);
    expect(readAnalyticsConsentFromCookieHeader("_ga=GA1.1.1")).toBeNull();
    expect(
      readAnalyticsConsentFromCookieHeader(
        `${ANALYTICS_CONSENT_COOKIE_NAME}=%7B%22analytics%22%3A%22yes%22%7D`,
      ),
    ).toBeNull();
    expect(
      readAnalyticsConsentFromCookieHeader(
        `${ANALYTICS_CONSENT_COOKIE_NAME}=not-json`,
      ),
    ).toBeNull();
    expect(readAnalyticsConsentFromCookieHeader(null)).toBeNull();
  });

  it("prefers the decision stored in local storage", () => {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify({ analytics: false, updatedAt: "2026-09-01T00:00:00.000Z" }),
    );
    setConsentCookie(serializeAnalyticsConsentCookie(accepted));

    expect(readAnalyticsConsent()).toEqual({
      analytics: false,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("falls back to the cookie and restores local storage when Safari purged it", () => {
    setConsentCookie(serializeAnalyticsConsentCookie(accepted));

    expect(readAnalyticsConsent()).toEqual(accepted);
    expect(hasAnalyticsConsent()).toBe(true);
    expect(
      JSON.parse(
        window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "null",
      ),
    ).toEqual(accepted);
  });

  it("returns null for a first-time visitor without asking the server", () => {
    expect(readAnalyticsConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the decision locally and asks the server for the long-lived cookie", () => {
    const consent = saveAnalyticsConsent({ analytics: true });

    expect(consent.analytics).toBe(true);
    expect(Number.isNaN(Date.parse(consent.updatedAt))).toBe(false);
    expect(
      JSON.parse(
        window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) ?? "null",
      ),
    ).toEqual(consent);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      ANALYTICS_CONSENT_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        body: JSON.stringify(consent),
      }),
    );
  });

  it("re-issues the cookie only when it is missing or older than the stored decision", () => {
    syncAnalyticsConsentCookie(null);
    expect(fetchMock).not.toHaveBeenCalled();

    syncAnalyticsConsentCookie(accepted);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setConsentCookie(serializeAnalyticsConsentCookie(accepted));
    syncAnalyticsConsentCookie(accepted);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const newer = { analytics: false, updatedAt: "2026-09-04T15:00:00.000Z" };
    syncAnalyticsConsentCookie(newer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      ANALYTICS_CONSENT_ENDPOINT,
      expect.objectContaining({ body: JSON.stringify(newer) }),
    );
  });

  it("never throws when the network call fails", () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    expect(() => saveAnalyticsConsent({ analytics: false })).not.toThrow();
  });
});
