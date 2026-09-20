import { requireStoreRead } from "@/lib/store-access";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createMercadoLibreContentReview } from "@/lib/mercadolibre/content-assistant";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    await requireStoreRead(params.storeId);
    const listing = await prismadb.marketplaceListing.findFirst({
      where: { id: params.listingId, connection: { storeId: params.storeId } },
      select: {
        categoryId: true,
        marketplacePrice: true,
        metadata: true,
        product: {
          select: {
            name: true,
            description: true,
            brand: true,
            gtin: true,
            mpn: true,
            images: { select: { url: true } },
          },
        },
      },
    });
    if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");
    return NextResponse.json(createMercadoLibreContentReview(listing), {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(
      error,
      "MERCADOLIBRE_LISTING_CONTENT_REVIEW_GET",
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  }
}
