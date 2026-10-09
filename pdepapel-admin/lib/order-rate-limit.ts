import { createHash } from "node:crypto";

import { normalizeEmailForLimits } from "@/lib/order-risk";
import { consumeRateLimit } from "@/lib/rate-limit";

const hashKey = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export const ORDER_RATE_LIMITS = { perIp: 6, perEmail: 4, windowSeconds: 60 * 60 } as const;

/**
 * Pedidos creados desde la tienda por conexión y por correo normalizado. Las
 * llaves van con hash: ni la IP ni el correo quedan legibles en Redis. Falla
 * abierto como `consumeRateLimit`.
 */
export async function consumeOrderRateLimits(input: { scope: string; storeId: string; clientKey: string; email: string | null | undefined }) {
  const { scope, storeId, clientKey, email } = input;
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit({ key: `orders:${scope}:${storeId}:ip:${hashKey(clientKey)}`, limit: ORDER_RATE_LIMITS.perIp, windowSeconds: ORDER_RATE_LIMITS.windowSeconds }),
    consumeRateLimit({ key: `orders:${scope}:${storeId}:email:${hashKey(normalizeEmailForLimits(email))}`, limit: ORDER_RATE_LIMITS.perEmail, windowSeconds: ORDER_RATE_LIMITS.windowSeconds }),
  ]);
  return {
    allowed: byIp.allowed && byEmail.allowed,
    repeated: byIp.remaining < ORDER_RATE_LIMITS.perIp - 2 || byEmail.remaining < ORDER_RATE_LIMITS.perEmail - 1,
  };
}
