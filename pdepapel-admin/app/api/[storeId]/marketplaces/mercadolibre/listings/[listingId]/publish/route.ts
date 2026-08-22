import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceListingStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  MercadoLibrePublicationError,
  publishMercadoLibreListing,
} from "@/lib/mercadolibre/listings";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function getListingStatus(status: string | null) {
  if (status === "active") return MarketplaceListingStatus.ACTIVE;
  if (status === "paused") return MarketplaceListingStatus.PAUSED;
  if (status === "closed") return MarketplaceListingStatus.CLOSED;
  return MarketplaceListingStatus.ERROR;
}

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
      include: {
        connection: { select: { status: true, recoveryScheduleId: true } },
        product: {
          select: {
            id: true,
            name: true,
            description: true,
            stock: true,
            sku: true,
            brand: true,
            gtin: true,
            mpn: true,
            isArchived: true,
            images: {
              select: { url: true, isMain: true },
              orderBy: { isMain: "desc" },
              take: 10,
            },
          },
        },
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

    try {
      const publishedItem = await publishMercadoLibreListing(listing);
      const updatedListing = await prismadb.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          externalItemId: publishedItem.id,
          externalPermalink: publishedItem.permalink,
          status: getListingStatus(publishedItem.status),
          lastSyncedStock: Math.max(
            0,
            listing.product.stock - listing.stockSafetyBuffer,
          ),
          lastSyncedPrice: listing.marketplacePrice,
          lastRemoteUpdateAt: new Date(),
          lastError: publishedItem.descriptionWarning,
        },
      });
      return NextResponse.json(updatedListing, {
        status: 201,
        headers: CACHE_HEADERS.NO_CACHE,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 1_000)
          : "No fue posible publicar en Mercado Libre";
      if (
        error instanceof MercadoLibrePublicationError &&
        error.requiresDraftReview
      ) {
        await prismadb.marketplaceListing.update({
          where: { id: listing.id },
          data: { status: MarketplaceListingStatus.DRAFT, lastError: message },
        });
        throw ErrorFactory.InvalidRequest(message);
      }
      await prismadb.marketplaceListing.update({
        where: { id: listing.id },
        data: { status: MarketplaceListingStatus.ERROR, lastError: message },
      });
      if (error instanceof MercadoLibrePublicationError) {
        throw ErrorFactory.InvalidRequest(error.message);
      }
      throw error;
    }
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_PUBLISH_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
