import { Redis } from "@upstash/redis";

// Initialize Redis client (lazy - only when needed)
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = Redis.fromEnv();
  }
  return redis;
}

/**
 * Invalidate cache using SCAN instead of KEYS (Redis best practice).
 * SCAN is non-blocking and works better at scale.
 */
export async function invalidateStoreProductsCache(
  storeId: string,
): Promise<void> {
  try {
    const redisClient = getRedis();
    const pattern = `store:${storeId}:products:*`;
    let cursor = 0;

    // Safety limit to prevent infinite loops in weird connection states
    let maxIterations = 1000;

    do {
      const result = await redisClient.scan(cursor, {
        match: pattern,
        count: 100,
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
    console.error("Redis cache invalidation error:", error);
  }
}
