import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { buildMercadoLibreListingMetadata } from "@/lib/mercadolibre/listing-metadata";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const VIDEO_REMINDER_DAYS = 30;

async function getListing(userId: string, storeId: string, listingId: string) {
  await verifyStoreOwner(userId, storeId);

  const listing = await prismadb.marketplaceListing.findFirst({
    where: {
      id: listingId,
      connection: { storeId },
    },
    select: { id: true, metadata: true },
  });
  if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");

  return listing;
}

export async function POST(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const listing = await getListing(userId, params.storeId, params.listingId);
    const snoozedUntil = new Date(
      Date.now() + VIDEO_REMINDER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    await prismadb.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        metadata: buildMercadoLibreListingMetadata({
          current: listing.metadata,
          videoRecommendationSnoozedUntil: snoozedUntil,
        }),
      },
    });

    return NextResponse.json(
      { snoozedUntil },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_VIDEO_REMINDER_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const listing = await getListing(userId, params.storeId, params.listingId);
    await prismadb.marketplaceListing.update({
      where: { id: listing.id },
      data: {
        metadata: buildMercadoLibreListingMetadata({
          current: listing.metadata,
          videoRecommendationSnoozedUntil: null,
        }),
      },
    });

    return new NextResponse(null, {
      status: 204,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_VIDEO_REMINDER_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
