import { Redis } from "@upstash/redis";
import { enqueuePendingMarketplaceOutboxEventsForStore } from "./mercadolibre/outbox";
import { triggerStorefrontRevalidation } from "./revalidate-store";

// Initialize Redis client (lazy - only when needed)
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

/**
 * Purges cached product queries for a specific store from Redis.
 */
async function purgeRedisProductKeys(storeId: string): Promise<void> {
  try {
    const redisClient = getRedis();
    const pattern = `store:${storeId}:products:*`;
    let cursor = 0;
    let maxIterations = 500;

    do {
      const result = await redisClient.scan(cursor, {
        match: pattern,
        count: 250,
      });
      cursor = Number(result[0]);
      const keys = result[1];

      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      maxIterations--;
    } while (cursor !== 0 && maxIterations > 0);

    if (maxIterations === 0) {
      console.warn(
        `Cache invalidation for store ${storeId} hit iteration limit.`,
      );
    } else {
      console.log(`Cache invalidated for store ${storeId}`);
    }
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
): Promise<void> {
  try {
    await Promise.allSettled([
      triggerStorefrontRevalidation({ productId }),
      purgeRedisProductKeys(storeId),
      enqueuePendingMarketplaceOutboxEventsForStore(storeId),
    ]);
  } catch (error) {
    console.error("Error during store products cache invalidation:", error);
  }
}

