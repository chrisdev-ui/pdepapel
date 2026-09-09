import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env.mjs";

// Enlace firmado que deja comprar productos «Próximamente» antes de su fecha.
// El token viaja en el correo de acceso anticipado y, en la tienda, en una cookie.

export interface EarlyAccessPayload {
  storeId: string;
  homeContentId: string;
  exp: number;
}

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function isEarlyAccessConfigured(): boolean {
  return Boolean(env.NEWSLETTER_EARLY_ACCESS_SECRET);
}

export function createEarlyAccessToken(payload: EarlyAccessPayload, secret = env.NEWSLETTER_EARLY_ACCESS_SECRET): string {
  if (!secret) throw new Error("El acceso anticipado no está configurado");
  const body = encode(JSON.stringify(payload));
  return `${body}.${sign(secret, body)}`;
}

export function verifyEarlyAccessToken(
  storeId: string,
  token: string | null | undefined,
  now: Date = new Date(),
  secret = env.NEWSLETTER_EARLY_ACCESS_SECRET,
): EarlyAccessPayload | null {
  if (!secret || !token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(secret, body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(decode(body)) as Partial<EarlyAccessPayload>;
    if (payload.storeId !== storeId || typeof payload.homeContentId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < now.getTime()) return null;
    return { storeId, homeContentId: payload.homeContentId, exp: payload.exp };
  } catch {
    return null;
  }
}
