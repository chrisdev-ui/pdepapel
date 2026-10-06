import { trackGoogleEvent } from "@/lib/customer-analytics";

/**
 * Lo que ven los error boundaries de la tienda, sin datos de la persona.
 *
 * Incidente 2026-10-06: los boundaries solo hacían console.error y el único
 * rastro fue un error suelto en Clarity. Ahora cada boundary manda un evento
 * `exception` a GA4 (solo con el consentimiento de analítica, como todo lo
 * demás) y, si el error es un chunk de JS que no cargó (deploy nuevo,
 * conexión que se cortó), recarga la página una vez.
 */

export type ErrorBoundaryName = "routes" | "global" | "upstream";

export const CHUNK_RELOAD_STORAGE_KEY = "pdp:chunk-reload-at";
/** Dentro de esta ventana no se vuelve a recargar: evita bucles. */
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000;
const DESCRIPTION_MAX_LENGTH = 100;

const CHUNK_ERROR_PATTERN =
  /Loading chunk [\w-]+ failed|Loading CSS chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

type BoundaryError = Error & { digest?: string };

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === "ChunkLoadError" || (typeof message === "string" && CHUNK_ERROR_PATTERN.test(message));
}

export function describeBoundaryError(error: unknown): string {
  const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown };
  const label = typeof name === "string" && name ? name : "Error";
  const text = typeof message === "string" ? message.replace(/\s+/g, " ").trim() : "";
  return (text ? `${label}: ${text}` : label).slice(0, DESCRIPTION_MAX_LENGTH);
}

/** Evento `exception` de GA4: nombre y mensaje cortos, ruta sin parámetros y digest. */
export function reportBoundaryError(error: BoundaryError, boundary: ErrorBoundaryName): void {
  try {
    trackGoogleEvent("exception", {
      description: describeBoundaryError(error),
      fatal: true,
      page_path: typeof window === "undefined" ? "" : window.location.pathname,
      error_digest: error?.digest ?? "",
      error_boundary: boundary,
    });
  } catch {
    // Reportar nunca puede romper la pantalla de error.
  }
}

/**
 * Recarga una sola vez ante un chunk que no cargó. Devuelve true si va a
 * recargar. Sin sessionStorage (modo privado, bloqueado) no recarga: sin la
 * marca no hay forma de evitar un bucle.
 */
export function recoverFromChunkLoadError(
  error: unknown,
  {
    storage = typeof window === "undefined" ? undefined : window.sessionStorage,
    reload = () => window.location.reload(),
    now = Date.now(),
  }: { storage?: Pick<Storage, "getItem" | "setItem">; reload?: () => void; now?: number } = {},
): boolean {
  if (!isChunkLoadError(error) || !storage) return false;
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_STORAGE_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
