"use client";

import { openPrivacyPreferences } from "@/lib/analytics-consent";

export function PrivacyPreferencesButton() {
  return (
    <button
      type="button"
      onClick={openPrivacyPreferences}
      className="flex items-center gap-2 text-blue-yankees hover:text-pink-shell focus-visible:text-pink-shell"
    >
      Preferencias de privacidad
    </button>
  );
}
