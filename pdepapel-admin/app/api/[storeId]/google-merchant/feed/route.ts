import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import {
  GOOGLE_MERCHANT_FEED_CONTENT_TYPE,
  GOOGLE_MERCHANT_FEED_FILENAME,
  extractGoogleMerchantFeedToken,
  isGoogleMerchantFeedTokenValid,
  resolveGoogleMerchantFeed,
} from "@/lib/google-merchant-feed";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Hosted feed for Google Merchant Center's scheduled fetch. Protected by a
 * store-bound token (query string, bearer, or basic-auth password); without
 * `GOOGLE_MERCHANT_FEED_SECRET` it does not exist. Serves the last scheduled
 * build from cache and only generates on demand when nothing is cached.
 */
export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const secret = env.GOOGLE_MERCHANT_FEED_SECRET;
    if (!secret) {
      throw ErrorFactory.NotFound("El feed de Google Merchant no está configurado");
    }

    const token = extractGoogleMerchantFeedToken(request);
    if (!isGoogleMerchantFeedTokenValid(params.storeId, token, secret)) {
      throw ErrorFactory.Unauthorized();
    }

    const feed = await resolveGoogleMerchantFeed(params.storeId);

    return new NextResponse(feed.tsv, {
      status: 200,
      headers: {
        "Content-Type": GOOGLE_MERCHANT_FEED_CONTENT_TYPE,
        "Content-Disposition": `inline; filename="${GOOGLE_MERCHANT_FEED_FILENAME}"`,
        "Last-Modified": new Date(feed.report.generatedAt).toUTCString(),
        "X-Robots-Tag": "noindex, nofollow",
        ...CACHE_HEADERS.NO_CACHE,
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "GOOGLE_MERCHANT_FEED", {
      expectedStatusCodes: [403, 404],
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
