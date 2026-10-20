import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env.mjs";

/**
 * Enlace firmado de vista previa de una edición de cápsulas (para Paula,
 * con la venta apagada). La llave se deriva del secreto de acceso anticipado
 * con un propósito propio, así que un token de acceso anticipado nunca abre
 * una edición ni al revés. Cada token sirve para una sola edición.
 */
const PURPOSE = "capsule-preview-v1";
export const CAPSULE_PREVIEW_DAYS = 14;

interface PreviewPayload {
  storeId: string;
  editionId: string;
  exp: number;
}

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");
const keyFrom = (secret: string) => createHmac("sha256", secret).update(PURPOSE).digest();
const sign = (secret: string, body: string) => createHmac("sha256", keyFrom(secret)).update(body).digest("base64url");

export function isCapsulePreviewConfigured(secret = env.NEWSLETTER_EARLY_ACCESS_SECRET): boolean {
  return Boolean(secret);
}

export function createCapsulePreviewToken(
  { storeId, editionId }: { storeId: string; editionId: string },
  now: Date = new Date(),
  secret = env.NEWSLETTER_EARLY_ACCESS_SECRET,
): { token: string; expiresAt: Date } {
  if (!secret) throw new Error("La vista previa de cápsulas no está configurada");
  const expiresAt = new Date(now.getTime() + CAPSULE_PREVIEW_DAYS * 24 * 60 * 60 * 1000);
  const body = encode(JSON.stringify({ storeId, editionId, exp: Math.floor(expiresAt.getTime() / 1000) } satisfies PreviewPayload));
  return { token: `${body}.${sign(secret, body)}`, expiresAt };
}

export function verifyCapsulePreviewToken(
  { storeId, editionId }: { storeId: string; editionId: string },
  token: string | null | undefined,
  now: Date = new Date(),
  secret = env.NEWSLETTER_EARLY_ACCESS_SECRET,
): boolean {
  if (!secret || !token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = Buffer.from(sign(secret, body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const payload = JSON.parse(decode(body)) as Partial<PreviewPayload>;
    return payload.storeId === storeId && payload.editionId === editionId && typeof payload.exp === "number" && payload.exp * 1000 >= now.getTime();
  } catch {
    return false;
  }
}
