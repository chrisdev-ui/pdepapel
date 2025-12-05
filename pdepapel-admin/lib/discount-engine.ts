import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { DiscountType, Product } from "@prisma/client";
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
async function getActiveOffers(storeId: string) {
  const cacheKey = `store:${storeId}:active-offers`;

  try {
    const cachedOffers = await redis.get<any[]>(cacheKey);
    if (cachedOffers) {
      return cachedOffers;
    }
  } catch (error) {
    console.error("Redis get error:", error);
  }

  const now = getColombiaDate();

  const activeOffers = await prismadb.offer.findMany({
    where: {
      storeId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: {
      products: true,
      categories: true,
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
 * Calculates the effective price of a product considering active offers.
 * Checks for:
 * 1. Offers directly linked to the product.
 * 2. Offers linked to the product's category.
 *
 * Takes the offer with the highest discount amount (monetary value).
 */
export async function calculateDiscountedPrice(
  product: Pick<Product, "id" | "categoryId" | "price">,
  storeId: string,
): Promise<DiscountedProduct> {
  const activeOffers = await getActiveOffers(storeId);

  if (activeOffers.length === 0) {
    return {
      price: product.price,
      originalPrice: product.price,
      discount: 0,
      offerLabel: null,
      matchedOfferId: null,
    };
  }

  // Filter offers that apply to this product
  const applicableOffers = activeOffers.filter((offer: any) => {
    const isProductLinked = offer.products.some(
      (op: any) => op.productId === product.id,
    );
    const isCategoryLinked = offer.categories.some(
      (oc: any) => oc.categoryId === product.categoryId,
    );
    return isProductLinked || isCategoryLinked;
  });

  if (applicableOffers.length === 0) {
    return {
      price: product.price,
      originalPrice: product.price,
      discount: 0,
      offerLabel: null,
      matchedOfferId: null,
    };
  }

  // Calculate potential price for each offer and pick the best one (lowest price)
  let bestPrice = product.price;
  let bestOffer = null;

  for (const offer of applicableOffers) {
    let calculatedPrice = product.price;

    if (offer.type === DiscountType.PERCENTAGE) {
      calculatedPrice = product.price * (1 - offer.amount / 100);
    } else if (offer.type === DiscountType.FIXED) {
      calculatedPrice = Math.max(0, product.price - offer.amount);
    }

    if (calculatedPrice < bestPrice) {
      bestPrice = calculatedPrice;
      bestOffer = offer;
    }
  }

  if (!bestOffer) {
    return {
      price: product.price,
      originalPrice: product.price,
      discount: 0,
      offerLabel: null,
      matchedOfferId: null,
    };
  }

  return {
    price: bestPrice,
    originalPrice: product.price,
    discount: product.price - bestPrice,
    offerLabel: bestOffer.label || bestOffer.name,
    matchedOfferId: bestOffer.id,
  };
}

/**
 * Batch version of getProductPrice to avoid N+1 queries.
 */
export async function getProductsPrices(
  products: Pick<Product, "id" | "categoryId" | "price">[],
  storeId: string,
): Promise<Map<string, DiscountedProduct>> {
  const activeOffers = await getActiveOffers(storeId);
  const resultMap = new Map<string, DiscountedProduct>();

  for (const product of products) {
    // Filter offers that apply to this product
    const applicableOffers = activeOffers.filter((offer: any) => {
      const isProductLinked = offer.products.some(
        (op: any) => op.productId === product.id,
      );
      const isCategoryLinked = offer.categories.some(
        (oc: any) => oc.categoryId === product.categoryId,
      );
      return isProductLinked || isCategoryLinked;
    });

    if (applicableOffers.length === 0) {
      resultMap.set(product.id, {
        price: product.price,
        originalPrice: product.price,
        discount: 0,
        offerLabel: null,
        matchedOfferId: null,
      });
      continue;
    }

    // Find best offer
    let bestPrice = product.price;
    let bestOffer = null;

    for (const offer of applicableOffers) {
      let calculatedPrice = product.price;

      if (offer.type === DiscountType.PERCENTAGE) {
        calculatedPrice = product.price * (1 - offer.amount / 100);
      } else if (offer.type === DiscountType.FIXED) {
        calculatedPrice = Math.max(0, product.price - offer.amount);
      }

      if (calculatedPrice < bestPrice) {
        bestPrice = calculatedPrice;
        bestOffer = offer;
      }
    }

    if (bestOffer) {
      resultMap.set(product.id, {
        price: bestPrice,
        originalPrice: product.price,
        discount: product.price - bestPrice,
        offerLabel: bestOffer.label || bestOffer.name,
        matchedOfferId: bestOffer.id,
      });
    } else {
      resultMap.set(product.id, {
        price: product.price,
        originalPrice: product.price,
        discount: 0,
        offerLabel: null,
        matchedOfferId: null,
      });
    }
  }

  return resultMap;
}
