import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

/** Test hook. */
export function setResourceLockRedis(client: Redis | null) {
  redis = client;
}

export class ResourceBusyError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ResourceBusyError";
  }
}

/**
 * Candado corto para acciones que no se pueden repetir (crear una guía cobra
 * dinero): dos clics o dos pestañas sobre el mismo recurso hacen una sola
 * llamada; la segunda recibe un 409 claro. Sin Redis se ejecuta sin candado,
 * igual que la idempotencia del checkout.
 */
export async function withResourceLock<T>(key: string, busyMessage: string, handler: () => Promise<T>, ttlSeconds = 60): Promise<T> {
  let client: Redis;
  try {
    client = getRedis();
  } catch (error) {
    console.error("[RESOURCE_LOCK] Redis no configurado:", error);
    return handler();
  }
  let acquired: unknown;
  try {
    acquired = await client.set(`lock:${key}`, "1", { nx: true, ex: ttlSeconds });
  } catch (error) {
    console.error("[RESOURCE_LOCK] Redis no disponible, se continúa sin candado:", error);
    return handler();
  }
  if (acquired === null) throw new ResourceBusyError(busyMessage);
  try {
    return await handler();
  } finally {
    await client.del(`lock:${key}`).catch(() => undefined);
  }
}
