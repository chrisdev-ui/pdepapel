import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

/** Test hook: inyectar un cliente tipo Redis. */
export function setRateLimitRedis(client: Redis | null) {
  redis = client;
}

/** De quién viene la petición, detrás del proxy de Vercel. */
export function getClientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  return ip || "desconocida";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Ventana fija con INCR + EXPIRE sobre el Redis que ya usa el proyecto.
 *
 * Se eligió esto y no una librería porque no había ninguna y el cliente ya
 * está aquí: una sentencia por petición y nada que mantener. La ventana fija
 * permite un pico al cruzar el borde, que para frenar abuso da igual.
 *
 * **Falla abierto**: si Redis no responde, se deja pasar. Nunca se pierde una
 * venta por el limitador, igual que en el guardia de idempotencia.
 */
export async function consumeRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = input;
  try {
    const client = getRedis();
    const used = await client.incr(key);
    if (used === 1) {
      await client.expire(key, windowSeconds);
    }
    const remaining = Math.max(0, limit - used);
    return {
      allowed: used <= limit,
      remaining,
      retryAfterSeconds: windowSeconds,
    };
  } catch (error) {
    console.error("[RATE_LIMIT] Redis no respondió; se deja pasar:", error);
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}
