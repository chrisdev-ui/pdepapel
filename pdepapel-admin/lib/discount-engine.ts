import prismadb from "@/lib/prismadb";
import { Product } from "@prisma/client";

import { pickBestOffer, type ActiveOffer } from "@/lib/offer-pricing";
import { Redis } from "@upstash/redis";

// Initialize Redis client
const redis = Redis.fromEnv();

export interface DiscountedProduct {
  price: number;
  originalPrice: number;
  discount: number;
  offerLabel: string | null;
  matchedOfferId: string | null;
}

const CACHE_TTL = 60 * 60; // 1 hour

/**
 * Fetches active offers for a store, using Redis cache.
 */
export async function getActiveOffers(storeId: string) {
  const cacheKey = `store:${storeId}:active-offers`;

  try {
    const cachedOffers = await redis.get<any[]>(cacheKey);
    if (cachedOffers) {
      return cachedOffers;
    }
  } catch (error) {
    console.error("Redis get error:", error);
  }

  // Reloj real: las vigencias se guardan como instantes UTC (lib/promotion-window.ts).
  const now = new Date();

  const activeOffers = await prismadb.offer.findMany({
    where: {
      storeId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    // Orden fijo: entre dos ofertas que dejan el mismo precio gana la creada primero.
    orderBy: { createdAt: "asc" },
    include: {
      products: true,
      categories: true,
      productGroups: true,
    },
  });

  try {
    await redis.set(cacheKey, activeOffers, { ex: CACHE_TTL });
  } catch (error) {
    console.error("Redis set error:", error);
  }

  return activeOffers;
}

/**
 * Precio con la mejor oferta vigente (por producto, categoría o grupo de
 * variantes): la regla vive en `lib/offer-pricing.ts`.
 */
export async function calculateDiscountedPrice(
  product: Pick<Product, "id" | "categoryId" | "price" | "productGroupId">,
  storeId: string,
): Promise<DiscountedProduct> {
  const activeOffers = (await getActiveOffers(storeId)) as unknown as ActiveOffer[];
  return pickBestOffer(product, activeOffers);
}

/**
 * Batch version of calculateDiscountedPrice to avoid N+1 queries.
 */
export async function getProductsPrices(
  products: Pick<Product, "id" | "categoryId" | "price" | "productGroupId">[],
  storeId: string,
): Promise<Map<string, DiscountedProduct>> {
  const activeOffers = (await getActiveOffers(storeId)) as unknown as ActiveOffer[];
  return new Map(products.map((product) => [product.id, pickBestOffer(product, activeOffers)]));
}
