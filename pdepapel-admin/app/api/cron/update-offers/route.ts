import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.NO_CACHE,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const authToken = req.headers.get("authorization")?.split("Bearer ").at(1);

    if (!authToken || authToken !== env.CRON_SECRET)
      throw ErrorFactory.Unauthorized();

    const now = getColombiaDate();

    const [expiredOffers, validOffers] = await prismadb.$transaction([
      // Deactivate expired offers
      prismadb.offer.updateMany({
        where: {
          endDate: { lt: now },
          isActive: true,
        },
        data: { isActive: false },
      }),
      // Activate valid offers
      prismadb.offer.updateMany({
        where: {
          startDate: { lte: now },
          endDate: { gt: now },
          isActive: false,
        },
        data: { isActive: true },
      }),
    ]);

    // Invalidate Redis cache for all stores (or could be more targeted)
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();

      // Get all unique store IDs from updated offers
      const allStoreIds = await prismadb.offer.findMany({
        where: {
          OR: [
            { endDate: { lt: now } },
            {
              AND: [{ startDate: { lte: now } }, { endDate: { gt: now } }],
            },
          ],
        },
        select: { storeId: true },
        distinct: ["storeId"],
      });

      // Invalidate cache for each affected store
      for (const { storeId } of allStoreIds) {
        await redis.del(`store:${storeId}:active-offers`);
      }
    } catch (error) {
      console.error("Redis cache invalidation error:", error);
    }

    return NextResponse.json(
      {
        deactivated: expiredOffers.count,
        activated: validOffers.count,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_CRON", { headers: corsHeaders });
  }
}
