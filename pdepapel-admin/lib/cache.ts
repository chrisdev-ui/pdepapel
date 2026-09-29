import { Redis } from "@upstash/redis";
import { enqueuePendingMarketplaceOutboxEventsForStore } from "./mercadolibre/outbox";
import { productCacheKeyPatterns } from "./product-cache-keys";
import { triggerStorefrontRevalidation } from "./revalidate-store";

export { productCacheKeyPatterns };

// Initialize Redis client (lazy - only when needed)
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

/**
 * Presupuestos de tiempo. La invalidación acompaña a escrituras que ya
 * terminaron (marcar pagado, guardar un producto): si la caché tarda, lo
 * peor que puede pasar es una página vieja unos minutos (todas las claves
 * tienen TTL). Lo que no puede pasar es lo que pasó el 2026-09-29: el SCAN
 * de purga sin tope de tiempo y con cinco reintentos del cliente colgó la
 * función hasta los 60 s de Vercel y Paula no pudo marcar pedidos pagados.
 */
export const PURGE_BUDGET_MS = 3000;
export const INVALIDATION_BUDGET_MS = 3500;

/**
 * Espera `work` como mucho `budgetMs`; si no llega, avisa y sigue. Nunca
 * lanza: el trabajo que se quedó atrás termina solo en segundo plano.
 */
export async function withTimeBudget<T>(
  label: string,
  budgetMs: number,
  work: Promise<T>,
): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`${label}: no terminó en ${budgetMs} ms; se sigue sin esperar.`);
      resolve(undefined);
    }, budgetMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch (error) {
    console.error(`${label}:`, error);
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Cliente de un solo uso para la purga: un reintento corto en vez de los
 * cinco por defecto y una señal que aborta todo lo pendiente al agotarse el
 * presupuesto, para que un Upstash lento no retenga la función.
 */
function purgeClient(budgetMs: number): Redis {
  return Redis.fromEnv({
    retry: { retries: 1, backoff: () => 250 },
    signal: AbortSignal.timeout(budgetMs),
  });
}

/**
 * Purges cached product queries for a specific store from Redis, within a
 * time budget. SCAN traverses the whole keyspace once per pattern, so the
 * loop stops at the deadline and reports how far it got.
 */
async function purgeRedisProductKeys(
  storeId: string,
  budgetMs = PURGE_BUDGET_MS,
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  try {
    const redisClient = purgeClient(budgetMs);
    for (const pattern of productCacheKeyPatterns(storeId)) {
      let cursor = 0;
      let iterations = 0;
      const maxIterations = 500;

      do {
        if (Date.now() >= deadline) {
          console.warn(
            `Cache invalidation for store ${storeId} (${pattern}) stopped at the ${budgetMs} ms budget after ${iterations} iterations.`,
          );
          return;
        }
        const result = await redisClient.scan(cursor, {
          match: pattern,
          count: 250,
        });
        cursor = Number(result[0]);
        const keys = result[1];

        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
        iterations++;
      } while (cursor !== 0 && iterations < maxIterations);

      if (iterations >= maxIterations) {
        console.warn(
          `Cache invalidation for store ${storeId} (${pattern}) hit iteration limit.`,
        );
      }
    }
    console.log(`Cache invalidated for store ${storeId}`);
  } catch (error) {
    console.error(`Redis cache purge error for store ${storeId}:`, error);
  }
}

/**
 * Invalidates store products cache across layers:
 * 1. Edge CDN (Storefront On-Demand Revalidation)
 * 2. Key-Value Cache (Upstash Redis)
 * 3. Marketplace Outbox Dispatch (Mercado Libre queue)
 *
 * Runs concurrently with Promise.allSettled to minimize API response latency.
 */
export async function invalidateStoreProductsCache(
  storeId: string,
  productId?: string,
  options: { budgetMs?: number; purgeBudgetMs?: number } = {},
): Promise<void> {
  const budgetMs = options.budgetMs ?? INVALIDATION_BUDGET_MS;
  const purgeBudgetMs = Math.min(options.purgeBudgetMs ?? PURGE_BUDGET_MS, budgetMs);
  // Nunca dentro de una transacción de base de datos: llámala después del
  // commit. Y nunca sin tope: la escritura ya está hecha y no debe esperar
  // a Redis, a la tienda ni a QStash más que unos segundos.
  await withTimeBudget(
    `Cache invalidation for store ${storeId}`,
    budgetMs,
    Promise.allSettled([
      triggerStorefrontRevalidation({ productId }),
      purgeRedisProductKeys(storeId, purgeBudgetMs),
      enqueuePendingMarketplaceOutboxEventsForStore(storeId),
    ]),
  );
}

/**
 * Invalida lo que depende de las promociones: la lista de ofertas activas en
 * Redis, las consultas de productos cacheadas (llevan precio con descuento) y
 * las páginas ISR de la tienda. Se llama al crear, editar, borrar o apagar una
 * oferta y desde el cron diario cuando alguna vigencia cambia.
 */
export async function invalidateStorePromotionsCache(
  storeId: string,
): Promise<void> {
  const purgeActiveOffers = async () => {
    try {
      await getRedis().del(`store:${storeId}:active-offers`);
    } catch (error) {
      console.error(
        `Redis active-offers purge error for store ${storeId}:`,
        error,
      );
    }
  };
  await withTimeBudget(
    `Promotions cache invalidation for store ${storeId}`,
    INVALIDATION_BUDGET_MS,
    Promise.allSettled([
      purgeActiveOffers(),
      purgeRedisProductKeys(storeId),
      triggerStorefrontRevalidation(),
    ]),
  );
}
