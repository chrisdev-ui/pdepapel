import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getColombiaDate } from "@/lib/date-utils";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId)
      throw ErrorFactory.InvalidRequest("Se requiere el ID de la oferta");

    await verifyStoreOwner(userId, params.storeId);

    const offer = await prismadb.offer.findUnique({
      where: { id: params.offerId },
    });

    if (!offer) {
      throw ErrorFactory.NotFound("Oferta no encontrada");
    }

    const now = getColombiaDate();
    const isValid = offer.startDate <= now && offer.endDate >= now;

    const updatedOffer = await prismadb.offer.update({
      where: { id: params.offerId },
      data: {
        isActive: isValid,
      },
    });

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

    return NextResponse.json(updatedOffer, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "OFFER_VALIDATE");
  }
}
