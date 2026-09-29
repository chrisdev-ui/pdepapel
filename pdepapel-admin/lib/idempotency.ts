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

/**
 * Presupuesto de tiempo para cada tramo con Redis. La guarda existe para
 * evitar un pedido duplicado; si Redis tarda más que esto, se sigue sin
 * guarda (una venta nunca se queda colgada por la caché de idempotencia,
 * como pasó el 2026-09-29 con la purga de caché). El cliente de Upstash
 * reintenta cinco veces sin tope por defecto: con el host sin responder
 * tarda más de un minuto en rendirse, más que la propia función.
 */
export const IDEMPOTENCY_BUDGET_MS = 1500;

class IdempotencyTimeout extends Error {
  constructor(label: string, budgetMs: number) {
    super(`${label} no respondió en ${budgetMs} ms`);
    this.name = "IdempotencyTimeout";
  }
}

/** Rechaza si `work` no termina dentro del presupuesto; el trabajo sigue solo. */
function within<T>(label: string, budgetMs: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IdempotencyTimeout(label, budgetMs)), budgetMs);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

interface StoredResponse {
  status: number;
  body: unknown;
}

let redis: Redis | null = null;
/**
 * Un cliente por petición con un solo reintento corto y una señal que aborta
 * lo pendiente al agotarse el presupuesto; en pruebas se inyecta uno fijo.
 */
function getRedis(budgetMs: number): Redis {
  if (redis) return redis;
  return Redis.fromEnv({
    retry: { retries: 1, backoff: () => 200 },
    signal: AbortSignal.timeout(budgetMs * 2 + 500),
  });
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
    client = getRedis(IDEMPOTENCY_BUDGET_MS);
  } catch (error) {
    console.error("[IDEMPOTENCY] Redis no configurado:", error);
    return handler();
  }

  try {
    const cached = await within(
      "[IDEMPOTENCY] lectura",
      IDEMPOTENCY_BUDGET_MS,
      client.get<StoredResponse>(resultKey(storeId, key)),
    );
    if (cached && typeof cached === "object" && "status" in cached) {
      return NextResponse.json(cached.body, {
        status: cached.status,
        headers: { ...extraHeaders, "Idempotent-Replayed": "true" },
      });
    }

    const acquired = await within(
      "[IDEMPOTENCY] bloqueo",
      IDEMPOTENCY_BUDGET_MS,
      client.set(lockKey(storeId, key), "1", {
        nx: true,
        ex: LOCK_TTL_SECONDS,
      }),
    );
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

  const releaseLock = () =>
    within("[IDEMPOTENCY] liberar", IDEMPOTENCY_BUDGET_MS, client.del(lockKey(storeId, key))).catch(
      (error) => console.error("[IDEMPOTENCY] No se pudo liberar el bloqueo:", error),
    );

  let response: NextResponse;
  try {
    response = await handler();
  } catch (error) {
    await releaseLock();
    throw error;
  }

  // Guardar la respuesta es lo que evita el duplicado en un reintento; si
  // Redis tarda, la venta ya está hecha y no se retiene la respuesta por ello.
  try {
    if (response.status >= 200 && response.status < 300) {
      const body = await response.clone().json();
      await within(
        "[IDEMPOTENCY] guardar",
        IDEMPOTENCY_BUDGET_MS,
        client.set(
          resultKey(storeId, key),
          { status: response.status, body } satisfies StoredResponse,
          { ex: IDEMPOTENCY_TTL_SECONDS },
        ),
      );
    }
  } catch (error) {
    console.error("[IDEMPOTENCY] No se pudo guardar la respuesta:", error);
  } finally {
    await releaseLock();
  }

  return response;
}
