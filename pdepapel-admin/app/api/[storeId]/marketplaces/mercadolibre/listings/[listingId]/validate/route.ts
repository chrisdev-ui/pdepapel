import { auth } from "@clerk/nextjs/server";
import { MarketplaceConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { LISTING_FOR_PUBLICATION_SELECT, validateMercadoLibreItemDraft } from "@/lib/mercadolibre/listings";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** «Validar con Mercado Libre»: revisa el borrador guardado con `/items/validate`, sin crear nada. */
export async function POST(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const listing = await prismadb.marketplaceListing.findFirst({
      where: { id: params.listingId, connection: { storeId: params.storeId } },
      select: {
        ...LISTING_FOR_PUBLICATION_SELECT,
        externalItemId: true,
        connection: { select: { status: true } },
      },
    });
    if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");
    if (listing.externalItemId) {
      throw ErrorFactory.Conflict("Esta publicación ya está en Mercado Libre");
    }
    if (listing.connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw ErrorFactory.InvalidRequest("La conexión de Mercado Libre no está activa");
    }

    const result = await validateMercadoLibreItemDraft(listing);
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_VALIDATE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
