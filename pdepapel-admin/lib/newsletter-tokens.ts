import { createHash, randomBytes } from "node:crypto";

export function normalizeNewsletterEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * La llave de las filas nuevas: Gmail ignora los puntos y lo que va después
 * de `+`, así que `j.o.h.n+x` en googlemail es `john` en gmail. Las filas
 * guardadas antes conservan la forma de `normalizeNewsletterEmail` (hay un
 * único por tienda y llave), por eso se busca con las dos.
 */
export function newsletterEmailKey(email: string): string {
  const lowered = normalizeNewsletterEmail(email);
  const at = lowered.lastIndexOf("@");
  if (at <= 0) return lowered;
  const domain = lowered.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return lowered;
  const local = lowered.slice(0, at).split("+")[0].replace(/\./g, "");
  return local ? `${local}@gmail.com` : lowered;
}

export function newsletterEmailLookupKeys(email: string): string[] {
  return Array.from(new Set([newsletterEmailKey(email), normalizeNewsletterEmail(email)]));
}

export function hashNewsletterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createNewsletterToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString("base64url");

  return { token, tokenHash: hashNewsletterToken(token) };
}

export function normalizeNewsletterSource(source?: string | null): string {
  const normalizedSource = source?.trim().slice(0, 120);
  if (!normalizedSource || !normalizedSource.startsWith("/")) return "/";

  return normalizedSource;
}
