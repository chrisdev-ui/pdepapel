import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStorePromotionsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import { getPromotionStatus } from "@/lib/promotion-status";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** Recalcula una oferta: la apaga si venció y devuelve su estado real. Nunca la enciende. */
export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId) throw ErrorFactory.InvalidRequest("Se requiere el ID de la oferta");

    await verifyStoreOwner(userId, params.storeId);

    const offer = await prismadb.offer.findFirst({
      where: { id: params.offerId, storeId: params.storeId },
    });
    if (!offer) throw ErrorFactory.NotFound("Oferta no encontrada");

    const now = new Date();
    const expired = offer.endDate < now;
    const updated =
      expired && offer.isActive
        ? await prismadb.offer.update({ where: { id: offer.id, storeId: params.storeId }, data: { isActive: false } })
        : offer;

    if (expired && offer.isActive) await invalidateStorePromotionsCache(params.storeId);

    return NextResponse.json(
      { ...updated, status: getPromotionStatus(updated, now) },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "OFFER_VALIDATE");
  }
}
