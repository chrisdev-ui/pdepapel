import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

// Enable Edge Runtime for faster response times

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthorized();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const now = getColombiaDate();

    await prismadb.$transaction([
      prismadb.offer.updateMany({
        where: {
          storeId: params.storeId,
        },
        data: {
          isActive: {
            set: false,
          },
        },
      }),
      prismadb.offer.updateMany({
        where: {
          storeId: params.storeId,
          startDate: {
            lte: now,
          },
          endDate: {
            gte: now,
          },
        },
        data: {
          isActive: true,
        },
      }),
    ]);

    // Invalidate Redis cache
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      await redis.del(`store:${params.storeId}:active-offers`);
      const productKeys = await redis.keys(
        `store:${params.storeId}:products:*`,
      );
      if (productKeys.length > 0) {
        await redis.del(...productKeys);
      }
    } catch (error) {
      console.error("Redis delete error:", error);
    }

    return NextResponse.json(
      {
        message: "Se han activado todas las ofertas válidas",
      },
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_UPDATE_VALIDITY");
  }
}
