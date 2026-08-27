export const ANALYTICS_CONSENT_STORAGE_KEY = "pdepapel:analytics-consent:v2";
export const OPEN_PRIVACY_PREFERENCES_EVENT =
  "pdepapel:open-privacy-preferences";

export interface AnalyticsConsent {
  analytics: boolean;
  updatedAt: string;
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<AnalyticsConsent>;
    if (
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return {
      analytics: parsed.analytics,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function saveAnalyticsConsent(
  preferences: Omit<AnalyticsConsent, "updatedAt">,
): AnalyticsConsent {
  const consent = { ...preferences, updatedAt: new Date().toISOString() };

  window.localStorage.setItem(
    ANALYTICS_CONSENT_STORAGE_KEY,
    JSON.stringify(consent),
  );

  return consent;
}

export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent()?.analytics === true;
}

export function openPrivacyPreferences(): void {
  window.dispatchEvent(new Event(OPEN_PRIVACY_PREFERENCES_EVENT));
}
