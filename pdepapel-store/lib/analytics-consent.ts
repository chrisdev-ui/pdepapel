export const ANALYTICS_CONSENT_VERSION = "v2";
export const ANALYTICS_CONSENT_STORAGE_KEY = `pdepapel:analytics-consent:${ANALYTICS_CONSENT_VERSION}`;
export const ANALYTICS_CONSENT_COOKIE_NAME = `pdepapel_analytics_consent_${ANALYTICS_CONSENT_VERSION}`;
export const ANALYTICS_CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
export const ANALYTICS_CONSENT_ENDPOINT = "/api/consent";
export const OPEN_PRIVACY_PREFERENCES_EVENT =
  "pdepapel:open-privacy-preferences";

export interface AnalyticsConsent {
  analytics: boolean;
  updatedAt: string;
}

export function parseAnalyticsConsent(value: unknown): AnalyticsConsent | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Partial<AnalyticsConsent>;
  if (
    typeof candidate.analytics !== "boolean" ||
    typeof candidate.updatedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.updatedAt))
  ) {
    return null;
  }

  return {
    analytics: candidate.analytics,
    updatedAt: candidate.updatedAt,
  };
}

function parseSerializedConsent(
  raw: string | null | undefined,
): AnalyticsConsent | null {
  if (!raw) return null;

  try {
    return parseAnalyticsConsent(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function serializeAnalyticsConsentCookie(
  consent: AnalyticsConsent,
): string {
  return encodeURIComponent(JSON.stringify(consent));
}

export function readAnalyticsConsentFromCookieHeader(
  cookieHeader: string | null | undefined,
): AnalyticsConsent | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name !== ANALYTICS_CONSENT_COOKIE_NAME) continue;

    try {
      return parseSerializedConsent(decodeURIComponent(valueParts.join("=")));
    } catch {
      return null;
    }
  }

  return null;
}

function readStoredConsent(): AnalyticsConsent | null {
  try {
    return parseSerializedConsent(
      window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function writeStoredConsent(consent: AnalyticsConsent): void {
  try {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      JSON.stringify(consent),
    );
  } catch {
    // Storage can be unavailable (private mode, quota, disabled). The cookie
    // mirror still remembers the decision.
  }
}

function readCookieConsent(): AnalyticsConsent | null {
  if (typeof document === "undefined") return null;

  try {
    return readAnalyticsConsentFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}

/**
 * Reads the visitor's decision. Local storage is the primary store; the
 * HTTP-set cookie is the fallback because Safari/iOS deletes script-written
 * storage after 7 days without a visit, while cookies set by the server keep
 * their expiry. When only the cookie survives, local storage is restored.
 */
export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;

  const stored = readStoredConsent();
  if (stored) return stored;

  const fromCookie = readCookieConsent();
  if (fromCookie) writeStoredConsent(fromCookie);

  return fromCookie;
}

/** Asks the server to (re)issue the long-lived consent cookie. Fire-and-forget. */
export function persistAnalyticsConsentCookie(consent: AnalyticsConsent): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;

  try {
    void fetch(ANALYTICS_CONSENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(consent),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Never let analytics bookkeeping break the storefront.
  }
}

/**
 * Re-issues the cookie when it is missing or older than the stored decision,
 * so a visitor whose cookie expired or whose earlier request failed is not
 * asked again on a future visit.
 */
export function syncAnalyticsConsentCookie(
  consent: AnalyticsConsent | null,
): void {
  if (!consent) return;

  const cookie = readCookieConsent();
  if (cookie && Date.parse(cookie.updatedAt) >= Date.parse(consent.updatedAt)) {
    return;
  }

  persistAnalyticsConsentCookie(consent);
}

export function saveAnalyticsConsent(
  preferences: Omit<AnalyticsConsent, "updatedAt">,
): AnalyticsConsent {
  const consent = { ...preferences, updatedAt: new Date().toISOString() };

  writeStoredConsent(consent);
  persistAnalyticsConsentCookie(consent);

  return consent;
}

export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent()?.analytics === true;
}

export function openPrivacyPreferences(): void {
  window.dispatchEvent(new Event(OPEN_PRIVACY_PREFERENCES_EVENT));
}
