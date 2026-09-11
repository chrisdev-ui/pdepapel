import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStorePromotionsCache } from "@/lib/cache";
import { assertFixedAmountBelowPrices, assertOfferTargetsInStore, offerTargetsData, parseOfferInput } from "@/lib/offers";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId) throw ErrorFactory.InvalidRequest("ID de oferta requerido");
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const offer = await prismadb.offer.findFirst({
      where: { id: params.offerId, storeId: params.storeId },
      include: { products: true, categories: true, productGroups: true },
    });

    if (!offer) throw ErrorFactory.NotFound("Oferta no encontrada");

    return NextResponse.json(offer, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFER_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId) throw ErrorFactory.InvalidRequest("ID de oferta requerido");

    await verifyStoreOwner(userId, params.storeId);

    const existing = await prismadb.offer.findFirst({
      where: { id: params.offerId, storeId: params.storeId },
      select: { id: true },
    });
    if (!existing) throw ErrorFactory.NotFound("Oferta no encontrada");

    const input = parseOfferInput(await req.json());
    await assertOfferTargetsInStore(prismadb, params.storeId, input);
    await assertFixedAmountBelowPrices(prismadb, params.storeId, input);

    const { productIds, categoryIds, productGroupIds, ...data } = input;
    const targets = offerTargetsData({ productIds, categoryIds, productGroupIds });
    // Reemplazo atómico de los destinos dentro del mismo `update`.
    const offer = await prismadb.offer.update({
      where: { id: params.offerId, storeId: params.storeId },
      data: {
        ...data,
        products: { deleteMany: {}, ...targets.products },
        categories: { deleteMany: {}, ...targets.categories },
        productGroups: { deleteMany: {}, ...targets.productGroups },
      },
      include: { products: true, categories: true, productGroups: true },
    });

    await invalidateStorePromotionsCache(params.storeId);

    return NextResponse.json(offer, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFER_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; offerId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.offerId) throw ErrorFactory.InvalidRequest("ID de oferta requerido");

    await verifyStoreOwner(userId, params.storeId);

    const existing = await prismadb.offer.findFirst({
      where: { id: params.offerId, storeId: params.storeId },
      select: { id: true },
    });
    if (!existing) throw ErrorFactory.NotFound("Oferta no encontrada");

    const offer = await prismadb.offer.delete({
      where: { id: params.offerId, storeId: params.storeId },
    });

    await invalidateStorePromotionsCache(params.storeId);

    return NextResponse.json(offer, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFER_DELETE");
  }
}
