import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreJson } from "@/lib/mercadolibre/client";
import { parseMercadoLibreRemoteItemStatus } from "@/lib/mercadolibre/remote-status";
import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    await requireStoreOwner(params.storeId);

    const listing = await prismadb.marketplaceListing.findFirst({
      where: { id: params.listingId, connection: { storeId: params.storeId } },
      select: { connectionId: true, externalItemId: true, status: true },
    });
    if (!listing?.externalItemId) {
      throw ErrorFactory.InvalidRequest("El estado en Mercado Libre estará disponible después de publicar el producto");
    }

    const payload = await getMercadoLibreJson(listing.connectionId, `/items/${encodeURIComponent(listing.externalItemId)}`);
    return NextResponse.json(
      { panelStatus: listing.status, ...parseMercadoLibreRemoteItemStatus(payload) },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_REMOTE_STATUS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
