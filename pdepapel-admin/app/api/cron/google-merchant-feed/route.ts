import { NextRequest, NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { refreshGoogleMerchantFeed } from "@/lib/google-merchant-feed";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { recordJobRun } from "@/lib/job-runs";

export const dynamic = "force-dynamic";

/**
 * Daily rebuild of every store's Google Merchant feed into the cache so the
 * hosted URL always serves a fresh, precomputed file. Read-only on the
 * catalog; a failing store never blocks the others.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
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
    await Promise.all(
      results.map((result, index) =>
        recordJobRun("google-merchant-feed", {
          storeId: stores[index].id,
          ok: result.status === "fulfilled",
          detail:
            result.status === "fulfilled"
              ? `${result.value.exportedProducts} productos exportados`
              : result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
        }),
      ),
    );

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
