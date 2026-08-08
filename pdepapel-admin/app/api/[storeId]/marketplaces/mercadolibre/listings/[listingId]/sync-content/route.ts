import { auth } from "@clerk/nextjs";
import { MarketplaceConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplaceListingContentSyncEvent,
} from "@/lib/mercadolibre/outbox";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function POST(
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
        id: true,
        connectionId: true,
        productId: true,
        externalItemId: true,
        connection: { select: { status: true, recoveryScheduleId: true } },
      },
    });
    if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");
    if (!listing.externalItemId) {
      throw ErrorFactory.InvalidRequest(
        "Publica primero el borrador antes de sincronizar su contenido",
      );
    }
    if (
      listing.connection.status !== MarketplaceConnectionStatus.CONNECTED ||
      !listing.connection.recoveryScheduleId ||
      !getMercadoLibreQueueConfigurationStatus().configured
    ) {
      throw ErrorFactory.InvalidRequest(
        "Activa el procesamiento seguro de Mercado Libre antes de sincronizar contenido",
      );
    }

    await prismadb.$transaction((transaction) =>
      queueMarketplaceListingContentSyncEvent(transaction, {
        connectionId: listing.connectionId,
        listingId: listing.id,
        productId: listing.productId,
      }),
    );
    await enqueuePendingMarketplaceOutboxEvents(listing.connectionId);

    return NextResponse.json(
      { message: "El contenido quedó programado para sincronizarse" },
      { status: 202, headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_CONTENT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
