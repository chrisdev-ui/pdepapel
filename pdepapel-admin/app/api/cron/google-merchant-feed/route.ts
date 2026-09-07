import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { refreshGoogleMerchantFeed } from "@/lib/google-merchant-feed";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Daily rebuild of every store's Google Merchant feed into the cache so the
 * hosted URL always serves a fresh, precomputed file. Read-only on the
 * catalog; a failing store never blocks the others.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const stores = await prismadb.store.findMany({ select: { id: true } });
    const results = await Promise.allSettled(
      stores.map(async (store) => {
        const feed = await refreshGoogleMerchantFeed(store.id);
        return {
          storeId: store.id,
          exportedProducts: feed.report.exportedProducts,
          cached: feed.cached,
        };
      }),
    );

    const refreshed = results.flatMap((result) => {
      if (result.status === "fulfilled") return [result.value];

      console.error("Google Merchant feed refresh failed:", result.reason);
      return [];
    });

    return NextResponse.json(
      { refreshed, failed: results.length - refreshed.length },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "GOOGLE_MERCHANT_FEED_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
