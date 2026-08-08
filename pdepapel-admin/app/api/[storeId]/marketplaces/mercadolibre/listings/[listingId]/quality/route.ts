import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreResource } from "@/lib/mercadolibre/client";
import { getMercadoLibreListingMetadata } from "@/lib/mercadolibre/listing-metadata";
import { parseMercadoLibreListingQuality } from "@/lib/mercadolibre/listing-quality";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const listing = await prismadb.marketplaceListing.findFirst({
      where: {
        id: params.listingId,
        connection: { storeId: params.storeId },
      },
      select: {
        connectionId: true,
        externalItemId: true,
        metadata: true,
        product: { select: { videos: { select: { id: true } } } },
      },
    });
    if (!listing?.externalItemId) {
      throw ErrorFactory.InvalidRequest(
        "La calidad estará disponible después de publicar el producto",
      );
    }

    const payload = await getMercadoLibreResource(
      listing.connectionId,
      `/item/${encodeURIComponent(listing.externalItemId)}/performance`,
    );
    const quality = parseMercadoLibreListingQuality(payload);
    const videoRule = quality.pendingRules.find(
      (rule) => rule.isVideoRecommendation,
    );
    const metadata = getMercadoLibreListingMetadata(listing.metadata);

    return NextResponse.json(
      {
        ...quality,
        videoRecommendation: videoRule
          ? {
              ...videoRule,
              preparedVideoCount: listing.product.videos.length,
              snoozedUntil:
                metadata.quality?.videoRecommendationSnoozedUntil ?? null,
            }
          : null,
      },
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_QUALITY_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
