"use client";

import { openPrivacyPreferences } from "@/lib/analytics-consent";

export function PrivacyPreferencesButton() {
  return (
    <button
      type="button"
      onClick={openPrivacyPreferences}
      className="flex min-h-[44px] items-center rounded-md py-2 text-left text-blue-yankees hover:text-pink-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-shell focus-visible:ring-offset-2"
    >
      Preferencias de privacidad
    </button>
  );
}
