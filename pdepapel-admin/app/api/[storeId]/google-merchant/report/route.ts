import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import {
  GOOGLE_MERCHANT_FEED_SCHEDULE_LABEL,
  getGoogleMerchantFeedUrl,
  readCachedGoogleMerchantFeed,
  refreshGoogleMerchantFeed,
} from "@/lib/google-merchant-feed";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function requireOwner(storeId: string) {
  const { userId } = auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  await verifyStoreOwner(userId, storeId);
}

/** Owner-only view of the hosted feed: its URL, schedule and last report. */
export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireOwner(params.storeId);

    const secret = env.GOOGLE_MERCHANT_FEED_SECRET;
    const cached = await readCachedGoogleMerchantFeed(params.storeId);

    return NextResponse.json(
      {
        configured: Boolean(secret),
        feedUrl: secret
          ? getGoogleMerchantFeedUrl(params.storeId, secret, env.ADMIN_WEB_URL)
          : null,
        schedule: GOOGLE_MERCHANT_FEED_SCHEDULE_LABEL,
        report: cached?.report ?? null,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "GOOGLE_MERCHANT_REPORT_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

/** Owner-only manual refresh; reads the catalog and rewrites the cache. */
export async function POST(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireOwner(params.storeId);

    const feed = await refreshGoogleMerchantFeed(params.storeId);

    return NextResponse.json(
      { report: feed.report, cached: feed.cached },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "GOOGLE_MERCHANT_REPORT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
