/**
 * Versión vigente de los términos y de la política de privacidad: su fecha de
 * actualización. Las páginas la usan como «Última actualización», así que
 * cambiar la fecha de una política cambia su versión. La administración tiene
 * una copia con el historial (pdepapel-admin/lib/legal-versions.ts) y valida
 * contra ella lo que llega del checkout y del registro.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-10-21",
  privacy: "2026-10-26",
} as const;

export type LegalConsentVersions = { terms: string; privacy: string };

export function legalConsentPayload(): LegalConsentVersions {
  return { terms: LEGAL_VERSIONS.terms, privacy: LEGAL_VERSIONS.privacy };
}

/** «21 de octubre de 2026», como lo muestran las políticas. */
export function formatLegalDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}
