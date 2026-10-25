/**
 * Desafío invisible de Cloudflare Turnstile en los pedidos de la tienda.
 * Sin `TURNSTILE_SECRET_KEY` no hace nada, así que se despliega antes de
 * crear las claves. Si Cloudflare no responde se deja pasar: el límite de
 * pedidos y las señales de riesgo siguen ahí. `status` separa un token que
 * falta o no vale (culpa del navegador o de un bot) de Cloudflare caído.
 */
export const TURNSTILE_ERROR = "No pudimos confirmar que eres una persona. Recarga la página e inténtalo de nuevo.";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;
const STORE_HOST = "papeleriapdepapel.com";

export type TurnstileResult =
  | { ok: true; status: "verified" | "not-configured" | "unavailable" }
  | { ok: false; status: "missing" | "failed"; error: string };

export async function verifyTurnstile(token: string | null | undefined, remoteIp: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, status: "not-configured" };
  if (!token) return { ok: false, status: "missing", error: TURNSTILE_ERROR };

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }).toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    const result = (await response.json()) as { success?: boolean; hostname?: string };
    if (!result.success) return { ok: false, status: "failed", error: TURNSTILE_ERROR };
    const hostname = String(result.hostname ?? "");
    if (process.env.VERCEL_ENV === "production" && hostname !== STORE_HOST && !hostname.endsWith(`.${STORE_HOST}`)) {
      return { ok: false, status: "failed", error: TURNSTILE_ERROR };
    }
    return { ok: true, status: "verified" };
  } catch (error) {
    console.error("[TURNSTILE] Cloudflare no respondió; se deja pasar:", error);
    return { ok: true, status: "unavailable" };
  }
}
