import { createHmac, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { Redis } from "@upstash/redis";

import {
  GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS,
  getGoogleMerchantColor,
  getGoogleMerchantDescription,
  getGoogleMerchantPattern,
  getGoogleMerchantProductLink,
  getGoogleMerchantSize,
  toGoogleMerchantImageUrl,
} from "@/lib/google-merchant";
import prismadb from "@/lib/prismadb";

/**
 * Hosted Google Merchant feed.
 *
 * The same row-building logic feeds three consumers:
 * - the manual exporter (`npm run export:products-merchant`), which also
 *   verifies every storefront URL before writing a file;
 * - the daily GitHub Actions job (`admin-scheduled-tasks.yml`), which calls
 *   `/api/cron/google-merchant-feed` to regenerate the feed per store into Redis;
 * - the protected `GET /api/[storeId]/google-merchant/feed` route that
 *   Merchant Center fetches on its own schedule.
 *
 * Nothing here writes to the catalog. The feed only reads products.
 */

export const GOOGLE_MERCHANT_FEED_HEADERS = [
  "id",
  "title",
  "description",
  "link",
  "image_link",
  "additional_image_link",
  "price",
  "condition",
  "availability",
  "brand",
  "gtin",
  "mpn",
  "identifier_exists",
  "product_type",
  "item_group_id",
  "color",
  "size",
  "pattern",
  "excluded_destination",
] as const;

export const GOOGLE_MERCHANT_FEED_FILENAME = "google-merchant-feed.txt";
export const GOOGLE_MERCHANT_FEED_CONTENT_TYPE =
  "text/tab-separated-values; charset=utf-8";
/** Cron refreshes daily; the cache outlives a few missed runs on purpose. */
export const GOOGLE_MERCHANT_FEED_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
export const GOOGLE_MERCHANT_FEED_SCHEDULE_LABEL =
  "Todos los días a las 8:00 a. m. (hora de Colombia)";

export const GOOGLE_MERCHANT_FEED_PRODUCT_INCLUDE = {
  category: { include: { type: true } },
  color: true,
  design: true,
  size: true,
  productGroup: true,
  images: {
    orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.ProductInclude;

export type GoogleMerchantFeedProduct = Prisma.ProductGetPayload<{
  include: typeof GOOGLE_MERCHANT_FEED_PRODUCT_INCLUDE;
}>;

export function getGoogleMerchantFeedProductArgs(storeId: string) {
  return {
    where: { storeId, isArchived: false },
    include: GOOGLE_MERCHANT_FEED_PRODUCT_INCLUDE,
    orderBy: { name: "asc" as const },
  } satisfies Prisma.ProductFindManyArgs;
}

export type GoogleMerchantFeedReport = {
  generatedAt: string;
  activeProducts: number;
  exportedProducts: number;
  outOfStock: number;
  withoutIdentifier: number;
  missingImages: Array<{ id: string; productId: string; name: string }>;
  rewrittenImages: Array<{ id: string; from: string; to: string }>;
  groupsWithDuplicateVariants: string[];
  excludedDestinations: string[];
};

export type GoogleMerchantFeed = {
  tsv: string;
  report: GoogleMerchantFeedReport;
};

function cleanText(value: string | null | undefined) {
  return (value || "")
    .replace(/[\t\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findGroupsWithDuplicateVariants(
  products: Pick<
    GoogleMerchantFeedProduct,
    "productGroupId" | "sizeId" | "colorId" | "designId"
  >[],
) {
  const combinationsByGroup = new Map<string, Set<string>>();
  const duplicates = new Set<string>();

  for (const product of products) {
    if (!product.productGroupId) continue;

    const combination = [product.sizeId, product.colorId, product.designId].join(
      "|",
    );
    const combinations = combinationsByGroup.get(product.productGroupId);

    if (combinations?.has(combination)) {
      duplicates.add(product.productGroupId);
    } else if (combinations) {
      combinations.add(combination);
    } else {
      combinationsByGroup.set(product.productGroupId, new Set([combination]));
    }
  }

  return duplicates;
}

/**
 * Builds the tab-separated feed plus a report of what was adjusted or left
 * out. When `links` is given, only products present in it are exported and
 * their link is taken from it (the manual exporter uses this after verifying
 * every storefront page); otherwise the canonical storefront link is used.
 */
export function buildGoogleMerchantFeed(
  products: GoogleMerchantFeedProduct[],
  options: { links?: Map<string, string>; generatedAt?: Date } = {},
): GoogleMerchantFeed {
  const generatedAt = options.generatedAt ?? new Date();
  const groupsWithDuplicateVariants = findGroupsWithDuplicateVariants(products);
  const exported = options.links
    ? products.filter((product) => options.links!.has(product.id))
    : products;

  const missingImages: GoogleMerchantFeedReport["missingImages"] = [];
  const rewrittenImages: GoogleMerchantFeedReport["rewrittenImages"] = [];
  let outOfStock = 0;
  let withoutIdentifier = 0;

  const rows = exported.map((product) => {
    const feedId = product.sku || product.id;
    const mainImage = product.images.find((image) => image.isMain);
    const rawMainImage = mainImage?.url || product.images[0]?.url || "";
    const orderedImages = product.images
      .filter((image) => image.url !== rawMainImage)
      .slice(0, 10);
    const imageLink = toGoogleMerchantImageUrl(rawMainImage);
    const additionalImages = orderedImages.map((image) =>
      toGoogleMerchantImageUrl(image.url),
    );

    if (!rawMainImage) {
      missingImages.push({
        id: feedId,
        productId: product.id,
        name: product.name,
      });
    } else if (imageLink !== rawMainImage) {
      rewrittenImages.push({ id: feedId, from: rawMainImage, to: imageLink });
    }
    orderedImages.forEach((image, index) => {
      if (additionalImages[index] !== image.url) {
        rewrittenImages.push({
          id: feedId,
          from: image.url,
          to: additionalImages[index],
        });
      }
    });

    const brand = product.brand || product.productGroup?.brand || "";
    const productType = [product.category?.type?.name, product.category?.name]
      .filter(Boolean)
      .join(" > ");
    const identifierExists =
      product.hasNoProductIdentifier || (!product.gtin && !(brand && product.mpn))
        ? "no"
        : "";
    if (identifierExists === "no") withoutIdentifier += 1;
    const availability = product.stock > 0 ? "in_stock" : "out_of_stock";
    if (availability === "out_of_stock") outOfStock += 1;
    const itemGroupId =
      product.productGroupId &&
      !groupsWithDuplicateVariants.has(product.productGroupId)
        ? product.productGroupId
        : "";

    return [
      feedId,
      cleanText(product.name),
      cleanText(getGoogleMerchantDescription(product.description, product.name)),
      options.links?.get(product.id) ?? getGoogleMerchantProductLink(product),
      imageLink,
      additionalImages.join(","),
      `${product.price} COP`,
      "new",
      availability,
      cleanText(brand),
      product.gtin || "",
      product.mpn || "",
      identifierExists,
      cleanText(productType),
      itemGroupId,
      cleanText(getGoogleMerchantColor(product.name, product.color)),
      cleanText(getGoogleMerchantSize(product.category?.name, product.size)),
      cleanText(getGoogleMerchantPattern(product.name, product.design)),
      GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS.join(","),
    ].join("\t");
  });

  return {
    tsv: `${GOOGLE_MERCHANT_FEED_HEADERS.join("\t")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`,
    report: {
      generatedAt: generatedAt.toISOString(),
      activeProducts: products.length,
      exportedProducts: exported.length,
      outOfStock,
      withoutIdentifier,
      missingImages,
      rewrittenImages,
      groupsWithDuplicateVariants: Array.from(groupsWithDuplicateVariants),
      excludedDestinations: Array.from(GOOGLE_MERCHANT_EXCLUDED_DESTINATIONS),
    },
  };
}

// --- Access token -----------------------------------------------------------

/**
 * Merchant Center fetches the feed with a plain URL (optionally with HTTP
 * basic auth). The token is an HMAC of the store id under a server secret,
 * so the URL is store-bound, cannot be guessed, and rotates by changing
 * `GOOGLE_MERCHANT_FEED_SECRET`. Nothing about the catalog leaks from it.
 */
export function createGoogleMerchantFeedToken(storeId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`google-merchant-feed:${storeId}`)
    .digest("hex");
}

export function isGoogleMerchantFeedTokenValid(
  storeId: string,
  token: string | null | undefined,
  secret: string | null | undefined,
) {
  if (!token || !secret) return false;

  const expected = Buffer.from(createGoogleMerchantFeedToken(storeId, secret));
  const received = Buffer.from(token);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

/** Accepts `?token=`, `Authorization: Bearer <token>` or basic auth with the token as password. */
export function extractGoogleMerchantFeedToken(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get("token");
  if (fromQuery) return fromQuery.trim();

  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, value = ""] = authorization.split(" ", 2);

  if (scheme?.toLowerCase() === "bearer") return value.trim() || null;
  if (scheme?.toLowerCase() === "basic") {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      const password =
        separator === -1 ? decoded : decoded.slice(separator + 1);
      return password.trim() || null;
    } catch {
      return null;
    }
  }

  return null;
}

export function getGoogleMerchantFeedUrl(
  storeId: string,
  secret: string,
  baseUrl: string,
) {
  const url = new URL(
    `/api/${encodeURIComponent(storeId)}/google-merchant/feed`,
    baseUrl,
  );
  url.searchParams.set("token", createGoogleMerchantFeedToken(storeId, secret));
  return url.toString();
}

// --- Cache ------------------------------------------------------------------

export function getGoogleMerchantFeedCacheKeys(storeId: string) {
  return {
    feed: `store:${storeId}:google-merchant:feed`,
    report: `store:${storeId}:google-merchant:report`,
  };
}

function getRedis(): Redis | null {
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

export async function readCachedGoogleMerchantFeed(
  storeId: string,
): Promise<GoogleMerchantFeed | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const keys = getGoogleMerchantFeedCacheKeys(storeId);
    const [tsv, report] = await Promise.all([
      redis.get<string>(keys.feed),
      redis.get<GoogleMerchantFeedReport | string>(keys.report),
    ]);
    if (typeof tsv !== "string" || !report) return null;

    return {
      tsv,
      report: typeof report === "string" ? JSON.parse(report) : report,
    };
  } catch (error) {
    console.error(`Google Merchant feed cache read failed for ${storeId}:`, error);
    return null;
  }
}

async function writeCachedGoogleMerchantFeed(
  storeId: string,
  feed: GoogleMerchantFeed,
) {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const keys = getGoogleMerchantFeedCacheKeys(storeId);
    await Promise.all([
      redis.set(keys.feed, feed.tsv, {
        ex: GOOGLE_MERCHANT_FEED_CACHE_TTL_SECONDS,
      }),
      redis.set(keys.report, JSON.stringify(feed.report), {
        ex: GOOGLE_MERCHANT_FEED_CACHE_TTL_SECONDS,
      }),
    ]);
    return true;
  } catch (error) {
    console.error(`Google Merchant feed cache write failed for ${storeId}:`, error);
    return false;
  }
}

/** Reads the catalog, rebuilds the feed and stores it. Never mutates products. */
export async function refreshGoogleMerchantFeed(
  storeId: string,
): Promise<GoogleMerchantFeed & { cached: boolean }> {
  const products = await prismadb.product.findMany(
    getGoogleMerchantFeedProductArgs(storeId),
  );
  const feed = buildGoogleMerchantFeed(products);
  const cached = await writeCachedGoogleMerchantFeed(storeId, feed);

  return { ...feed, cached };
}

/** Serves the last scheduled build, generating one only when nothing is cached. */
export async function resolveGoogleMerchantFeed(
  storeId: string,
): Promise<GoogleMerchantFeed> {
  return (
    (await readCachedGoogleMerchantFeed(storeId)) ??
    (await refreshGoogleMerchantFeed(storeId))
  );
}
