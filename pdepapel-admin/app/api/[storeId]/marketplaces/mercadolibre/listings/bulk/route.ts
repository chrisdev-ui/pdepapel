import { auth } from "@clerk/nextjs/server";
import {
  MarketplaceConnectionStatus,
  MarketplaceListingStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreListingMetadata } from "@/lib/mercadolibre/listing-metadata";
import {
  enqueuePendingMarketplaceOutboxEvents,
  isMarketplaceListingPublicationInProgress,
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
    const { userId } = await auth();
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
        syncStock: true,
        status: true,
        metadata: true,
      },
    });
    if (listings.length !== listingIds.length) {
      throw ErrorFactory.InvalidRequest(
        "Una o más publicaciones no pertenecen a esta cuenta de Mercado Libre",
      );
    }

    const skipped: { listingId: string; reason: string }[] = [];
    let queued = 0;
    const listingById = new Map(listings.map((listing) => [listing.id, listing]));
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
          if (
            listing.status !== MarketplaceListingStatus.DRAFT &&
            listing.status !== MarketplaceListingStatus.ERROR
          ) {
            skipped.push({
              listingId: listing.id,
              reason: "Solo se publican borradores o publicaciones con error.",
            });
            continue;
          }
          // Un rechazo de Mercado Libre pendiente de corregir volvería a
          // fallar igual y gastaría una llamada real por intento.
          if (
            getMercadoLibreListingMetadata(listing.metadata).publicationError
              ?.kind === "review"
          ) {
            skipped.push({
              listingId: listing.id,
              reason:
                "Mercado Libre rechazó un dato de esta publicación; corrígelo desde Editar antes de volver a publicar.",
            });
            continue;
          }
          if (
            await isMarketplaceListingPublicationInProgress(
              transaction,
              connection.id,
              listing.id,
            )
          ) {
            skipped.push({
              listingId: listing.id,
              reason: "Ya se está enviando a Mercado Libre.",
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
          if (!listing.syncStock) {
            skipped.push({
              listingId: listing.id,
              reason: "La sincronización de stock está desactivada para esta publicación.",
            });
            continue;
          }
          stockProductIds.push(listing.productId);
          queued += 1;
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
        // Pausar solo lo activo y activar solo lo pausado: una publicación
        // cerrada o con error no cambia de estado desde aquí.
        if (
          targetStatus === "paused" &&
          listing.status !== MarketplaceListingStatus.ACTIVE
        ) {
          skipped.push({
            listingId: listing.id,
            reason:
              listing.status === MarketplaceListingStatus.PAUSED
                ? "Ya está pausada."
                : "Solo se pausan publicaciones activas.",
          });
          continue;
        }
        if (
          targetStatus === "active" &&
          listing.status !== MarketplaceListingStatus.PAUSED
        ) {
          skipped.push({
            listingId: listing.id,
            reason:
              listing.status === MarketplaceListingStatus.ACTIVE
                ? "Ya está activa."
                : "Solo se activan publicaciones pausadas.",
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
      }
    });

    const enqueued =
      queued > 0
        ? await enqueuePendingMarketplaceOutboxEvents(connection.id)
        : 0;
    // Resultado fila por fila: el panel lo muestra junto a cada publicación
    // en vez de un único mensaje anónimo para todo el lote.
    const skippedById = new Map(skipped.map((entry) => [entry.listingId, entry.reason]));
    const results = listingIds.map((listingId) => {
      const reason = skippedById.get(listingId);
      return {
        listingId,
        productId: listingById.get(listingId)?.productId ?? null,
        outcome: reason ? ("skipped" as const) : ("queued" as const),
        reason: reason ?? null,
      };
    });
    return NextResponse.json(
      { action, queued, enqueued, skipped, results },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTINGS_BULK_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
