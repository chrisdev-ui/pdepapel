import { createHash } from "node:crypto";

import { newsletterEmailKey } from "@/lib/newsletter-tokens";
import { elapsedSince } from "@/lib/order-risk";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

/** Menos que esto entre abrir el formulario y enviarlo no lo hace una persona. */
export const NEWSLETTER_MIN_SUBMIT_MS = 3_000;

export const NEWSLETTER_RATE_LIMITS = {
  perIp: { limit: 5, windowSeconds: 60 * 60 },
  perEmail: { limit: 3, windowSeconds: 24 * 60 * 60 },
} as const;

export type NewsletterDropReason = "honeypot" | "too_fast" | "rate_ip" | "rate_email";

export type NewsletterScreen =
  | { action: "accept" }
  /** Se responde como un alta normal, sin guardar ni enviar nada: no se le da pista al bot. */
  | { action: "drop"; reason: NewsletterDropReason };

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export function tripsNewsletterHoneypot(body: { website?: unknown; company?: unknown } | null | undefined): boolean {
  return [body?.website, body?.company].some((value) => typeof value === "string" && value.trim() !== "");
}

/**
 * Filtro de las altas desde la tienda, en el orden de los pedidos: trampa,
 * reloj, Turnstile y límites. Sin reloj cuenta como bot: los formularios de la
 * tienda siempre lo mandan y una llamada armada a mano no. Turnstile nunca
 * bloquea el boletín: sin token, con un desafío fallido o con Cloudflare caído
 * se registra y quedan la trampa, el reloj y los límites (una clave mal puesta
 * no puede tumbar todas las altas). Redis también falla abierto.
 */
export async function screenNewsletterSignup(
  req: Request,
  input: { storeId: string; email: string; website?: unknown; company?: unknown; formStartedAt?: unknown; turnstileToken?: unknown },
  now = Date.now(),
): Promise<NewsletterScreen> {
  if (tripsNewsletterHoneypot(input)) return { action: "drop", reason: "honeypot" };

  const elapsedMs = elapsedSince(input.formStartedAt, now);
  if (elapsedMs === null || elapsedMs < NEWSLETTER_MIN_SUBMIT_MS) return { action: "drop", reason: "too_fast" };

  const clientKey = getClientKey(req);
  const challenge = await verifyTurnstile(typeof input.turnstileToken === "string" ? input.turnstileToken : null, clientKey);
  if (!challenge.ok) console.warn("[NEWSLETTER] Turnstile no verificó el alta; siguen la trampa, el reloj y los límites.");

  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit({
      key: `newsletter:${input.storeId}:ip:${hashKey(clientKey)}`,
      limit: NEWSLETTER_RATE_LIMITS.perIp.limit,
      windowSeconds: NEWSLETTER_RATE_LIMITS.perIp.windowSeconds,
    }),
    consumeRateLimit({
      key: `newsletter:${input.storeId}:email:${hashKey(newsletterEmailKey(input.email))}`,
      limit: NEWSLETTER_RATE_LIMITS.perEmail.limit,
      windowSeconds: NEWSLETTER_RATE_LIMITS.perEmail.windowSeconds,
    }),
  ]);
  if (!byIp.allowed) return { action: "drop", reason: "rate_ip" };
  if (!byEmail.allowed) return { action: "drop", reason: "rate_email" };

  return { action: "accept" };
}
