import { auth } from "@clerk/nextjs";
import { MarketplaceConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplaceListingContentSyncEvent,
  queueMarketplaceListingPublicationEvent,
  queueMarketplaceListingStatusSyncEvent,
  queueMarketplacePriceSyncEvent,
  queueMarketplaceStockSyncEvents,
} from "@/lib/mercadolibre/outbox";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const MAX_BULK_LISTINGS = 20;

const ACTIONS = [
  "publish",
  "sync_stock",
  "sync_price",
  "sync_content",
  "pause",
  "activate",
] as const;

type BulkAction = (typeof ACTIONS)[number];

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw ErrorFactory.InvalidRequest("La acción masiva no es válida");
  }
  const body = value as Record<string, unknown>;
  const action = body.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as BulkAction)) {
    throw ErrorFactory.InvalidRequest("Selecciona una acción masiva válida");
  }
  if (!Array.isArray(body.listingIds)) {
    throw ErrorFactory.InvalidRequest("Selecciona al menos una publicación");
  }
  const listingIds = Array.from(
    new Set(
      body.listingIds.flatMap((listingId) =>
        typeof listingId === "string" && listingId.trim()
          ? [listingId.trim()]
          : [],
      ),
    ),
  );
  if (listingIds.length === 0 || listingIds.length > MAX_BULK_LISTINGS) {
    throw ErrorFactory.InvalidRequest(
      `Selecciona entre 1 y ${MAX_BULK_LISTINGS} publicaciones`,
    );
  }
  return { action: action as BulkAction, listingIds };
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const { action, listingIds } = parseBody(await request.json());
    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: "MERCADOLIBRE",
        },
      },
      select: { id: true, status: true, recoveryScheduleId: true },
    });
    if (connection?.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw ErrorFactory.InvalidRequest(
        "Conecta una cuenta activa de Mercado Libre antes de usar acciones masivas",
      );
    }
    if (
      !connection.recoveryScheduleId ||
      !getMercadoLibreQueueConfigurationStatus().configured
    ) {
      throw ErrorFactory.InvalidRequest(
        "Activa el procesamiento seguro antes de usar acciones masivas",
      );
    }

    const listings = await prismadb.marketplaceListing.findMany({
      where: { id: { in: listingIds }, connectionId: connection.id },
      select: {
        id: true,
        productId: true,
        externalItemId: true,
        marketplacePrice: true,
        syncPrice: true,
        status: true,
      },
    });
    if (listings.length !== listingIds.length) {
      throw ErrorFactory.InvalidRequest(
        "Una o más publicaciones no pertenecen a esta cuenta de Mercado Libre",
      );
    }

    const skipped: { listingId: string; reason: string }[] = [];
    let queued = 0;
    await prismadb.$transaction(async (transaction) => {
      const stockProductIds: string[] = [];
      for (const listing of listings) {
        if (action === "publish") {
          if (listing.externalItemId) {
            skipped.push({
              listingId: listing.id,
              reason: "Ya está publicada en Mercado Libre.",
            });
            continue;
          }
          await queueMarketplaceListingPublicationEvent(transaction, {
            connectionId: connection.id,
            listingId: listing.id,
            productId: listing.productId,
          });
          queued += 1;
          continue;
        }

        if (!listing.externalItemId) {
          skipped.push({
            listingId: listing.id,
            reason: "Primero debes publicar este borrador.",
          });
          continue;
        }

        if (action === "sync_stock") {
          stockProductIds.push(listing.productId);
          continue;
        }
        if (action === "sync_price") {
          if (!listing.syncPrice || listing.marketplacePrice === null) {
            skipped.push({
              listingId: listing.id,
              reason: "No tiene precio sincronizable configurado.",
            });
            continue;
          }
          await queueMarketplacePriceSyncEvent(transaction, {
            connectionId: connection.id,
            listingId: listing.id,
            productId: listing.productId,
            targetPrice: listing.marketplacePrice,
          });
          queued += 1;
          continue;
        }
        if (action === "sync_content") {
          await queueMarketplaceListingContentSyncEvent(transaction, {
            connectionId: connection.id,
            listingId: listing.id,
            productId: listing.productId,
          });
          queued += 1;
          continue;
        }

        const targetStatus = action === "pause" ? "paused" : "active";
        if (
          (targetStatus === "paused" && listing.status === "PAUSED") ||
          (targetStatus === "active" && listing.status === "ACTIVE")
        ) {
          skipped.push({
            listingId: listing.id,
            reason:
              targetStatus === "paused"
                ? "Ya está pausada."
                : "Ya está activa.",
          });
          continue;
        }
        await queueMarketplaceListingStatusSyncEvent(transaction, {
          connectionId: connection.id,
          listingId: listing.id,
          productId: listing.productId,
          targetStatus,
        });
        queued += 1;
      }

      if (stockProductIds.length > 0) {
        await queueMarketplaceStockSyncEvents(transaction, stockProductIds);
        queued += stockProductIds.length;
      }
    });

    const enqueued =
      queued > 0
        ? await enqueuePendingMarketplaceOutboxEvents(connection.id)
        : 0;
    return NextResponse.json(
      { queued, enqueued, skipped },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTINGS_BULK_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
