/**
 * Resultado común de una consulta a la pasarela desde la conciliación. Una
 * llave rechazada no es una caída: corta esa pasarela para toda la corrida.
 */
export type GatewayLookup<T> =
  | { kind: "found"; items: T[] }
  | { kind: "none" }
  | { kind: "key-rejected"; status: number }
  | { kind: "unavailable"; status: number | null; reason: string };

export interface GatewayFetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const GATEWAY_TIMEOUT_MS = 8000;

/** Una referencia que ningún pedido puede tener: verificar la llave sin tocar un pago. */
export const KEY_PROBE_REFERENCE = "pdepapel-verificacion-de-llave";

export async function fetchGatewayJson(
  url: string,
  headers: Record<string, string>,
  options: GatewayFetchOptions,
): Promise<{ ok: true; status: number; body: any } | { ok: false; status: number | null; body: any; reason: string }> {
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(url, {
      method: "GET",
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(options.timeoutMs ?? GATEWAY_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { ok: false, status: null, body: null, reason: name === "TimeoutError" || name === "AbortError" ? "tiempo agotado" : "sin conexión" };
  }
  let body: any = null;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) return { ok: false, status: response.status, body, reason: `HTTP ${response.status}` };
  return { ok: true, status: response.status, body };
}
