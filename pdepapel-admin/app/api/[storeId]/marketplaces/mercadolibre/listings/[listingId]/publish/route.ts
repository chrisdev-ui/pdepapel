import { auth } from "@clerk/nextjs/server";
import {
  MarketplaceConnectionStatus,
  MarketplaceOutboxStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getMarketplaceListingPublicationKey,
  processMarketplaceOutboxEvent,
  queueMarketplaceListingPublicationEvent,
} from "@/lib/mercadolibre/outbox";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Publica un borrador ahora. La ruta ya no llama a Mercado Libre por su
 * cuenta: encola (o reutiliza) el mismo evento PUBLISH_LISTING que usa la
 * publicación masiva y lo procesa en línea. Así hay un único camino que crea
 * el ítem, y la reserva atómica del evento (PENDING → PROCESSING) garantiza
 * que dos clics, dos pestañas o un clic más la cola no lo creen dos veces.
 */
export async function POST(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = await auth();
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
    if (listing.externalItemId) {
      throw ErrorFactory.Conflict(
        "Esta publicación ya fue enviada a Mercado Libre",
      );
    }
    if (listing.connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw ErrorFactory.InvalidRequest(
        "La conexión de Mercado Libre no está activa",
      );
    }
    if (
      !getMercadoLibreQueueConfigurationStatus().configured ||
      !listing.connection.recoveryScheduleId
    ) {
      throw ErrorFactory.InvalidRequest(
        "Activa el procesamiento seguro de Mercado Libre antes de publicar",
      );
    }

    const deduplicationKey = getMarketplaceListingPublicationKey(
      listing.connectionId,
      listing.id,
    );
    const existingEvent = await prismadb.marketplaceOutboxEvent.findUnique({
      where: { deduplicationKey },
      select: { id: true, status: true },
    });
    if (existingEvent?.status === MarketplaceOutboxStatus.PROCESSING) {
      throw ErrorFactory.Conflict(
        "Esta publicación ya se está enviando a Mercado Libre. Espera un momento y actualiza la lista.",
      );
    }
    await queueMarketplaceListingPublicationEvent(prismadb, {
      connectionId: listing.connectionId,
      listingId: listing.id,
      productId: listing.productId,
    });
    const event = await prismadb.marketplaceOutboxEvent.findUniqueOrThrow({
      where: { deduplicationKey },
      select: { id: true },
    });

    const result = await processMarketplaceOutboxEvent(event.id);
    const refreshed = await prismadb.marketplaceListing.findUniqueOrThrow({
      where: { id: listing.id },
    });

    switch (result.reason) {
      case "processed":
      case "superseded":
        return NextResponse.json(refreshed, {
          status: 201,
          headers: CACHE_HEADERS.NO_CACHE,
        });
      case "claimed_elsewhere":
      case "not_due":
        throw ErrorFactory.Conflict(
          "Esta publicación ya se está enviando a Mercado Libre. Espera un momento y actualiza la lista.",
        );
      case "listing_requires_review":
      case "failed":
        throw ErrorFactory.InvalidRequest(
          refreshed.lastError ?? "No fue posible publicar en Mercado Libre",
        );
      case "retry_scheduled":
        throw ErrorFactory.InvalidRequest(
          `${refreshed.lastError ?? "Mercado Libre no respondió"}. Se reintentará automáticamente en unos minutos; no hace falta volver a publicar.`,
        );
      default:
        throw ErrorFactory.InvalidRequest(
          refreshed.lastError ?? "No fue posible publicar en Mercado Libre",
        );
    }
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_PUBLISH_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
