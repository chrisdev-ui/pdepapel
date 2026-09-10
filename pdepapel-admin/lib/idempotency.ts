import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * Idempotent order creation.
 *
 * The storefront sends an `Idempotency-Key` header with every attempt to
 * create an order. A retry after a timeout or a double tap must return the
 * order that was already created instead of creating a second one. Results
 * are kept in Redis for 24 hours; without the header (admin dashboard, older
 * clients) the handler runs as before. A Redis outage never blocks a sale:
 * the handler simply runs without the guard.
 */

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 60;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

interface StoredResponse {
  status: number;
  body: unknown;
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

/** Test hook: inject a Redis-like client. */
export function setIdempotencyRedis(client: Redis | null) {
  redis = client;
}

export function readIdempotencyKey(req: Request): string | null {
  const value = req.headers.get(IDEMPOTENCY_HEADER)?.trim() ?? "";
  return KEY_PATTERN.test(value) ? value : null;
}

const resultKey = (storeId: string, key: string) => `idem:${storeId}:${key}`;
const lockKey = (storeId: string, key: string) => `idem-lock:${storeId}:${key}`;

/**
 * Wraps a POST handler. On a repeated key the stored response is replayed
 * with the same status and body (and an `Idempotent-Replayed: true` header);
 * while the first request is still running, a concurrent duplicate gets 409.
 */
export async function withIdempotency(
  req: Request,
  storeId: string,
  handler: () => Promise<NextResponse>,
  extraHeaders: Record<string, string> = {},
): Promise<NextResponse> {
  const key = readIdempotencyKey(req);
  if (!key) return handler();

  let client: Redis;
  try {
    client = getRedis();
  } catch (error) {
    console.error("[IDEMPOTENCY] Redis no configurado:", error);
    return handler();
  }

  try {
    const cached = await client.get<StoredResponse>(resultKey(storeId, key));
    if (cached && typeof cached === "object" && "status" in cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { ...extraHeaders, "Idempotent-Replayed": "true" },
      });
    }

    const acquired = await client.set(lockKey(storeId, key), "1", {
      nx: true,
      ex: LOCK_TTL_SECONDS,
    });
    if (acquired === null) {
      return NextResponse.json(
        {
          error:
            "Estamos procesando este pedido. Espera unos segundos e inténtalo de nuevo.",
        },
        { status: 409, headers: extraHeaders },
      );
    }
  } catch (error) {
    console.error("[IDEMPOTENCY] Redis no disponible, se continúa sin guarda:", error);
    return handler();
  }

  let response: NextResponse;
  try {
    response = await handler();
  } catch (error) {
    await client.del(lockKey(storeId, key)).catch(() => undefined);
    throw error;
  }

  try {
    if (response.status >= 200 && response.status < 300) {
      const body = await response.clone().json();
      await client.set(
        resultKey(storeId, key),
        { status: response.status, body } satisfies StoredResponse,
        { ex: IDEMPOTENCY_TTL_SECONDS },
      );
    }
  } catch (error) {
    console.error("[IDEMPOTENCY] No se pudo guardar la respuesta:", error);
  } finally {
    await client.del(lockKey(storeId, key)).catch(() => undefined);
  }

  return response;
}
