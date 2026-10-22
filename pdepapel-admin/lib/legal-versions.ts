/**
 * Copia de pdepapel-store/lib/legal-versions.ts con el historial: una versión
 * que llega del checkout o del registro solo se guarda si está aquí. Durante
 * un despliegue la tienda puede ir una versión adelante o atrás; por eso se
 * aceptan las anteriores. Al publicar una política nueva se agrega su fecha
 * al principio de la lista (tests/unit/lib/legal-versions.test.ts compara con
 * la tienda).
 */
export const KNOWN_LEGAL_VERSIONS = {
  terms: ["2026-10-21"],
  privacy: ["2026-10-21"],
} as const;

export const LEGAL_VERSIONS = {
  terms: KNOWN_LEGAL_VERSIONS.terms[0],
  privacy: KNOWN_LEGAL_VERSIONS.privacy[0],
} as const;

export type LegalVersions = { terms: string; privacy: string };

/** Las versiones si las dos son conocidas; si no, null (nunca se inventa una). */
export function parseLegalVersions(value: unknown): LegalVersions | null {
  if (!value || typeof value !== "object") return null;
  const { terms, privacy } = value as Record<string, unknown>;
  if (typeof terms !== "string" || typeof privacy !== "string") return null;
  if (!(KNOWN_LEGAL_VERSIONS.terms as readonly string[]).includes(terms)) return null;
  if (!(KNOWN_LEGAL_VERSIONS.privacy as readonly string[]).includes(privacy)) return null;
  return { terms, privacy };
}
