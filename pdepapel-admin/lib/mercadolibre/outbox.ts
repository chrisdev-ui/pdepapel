import {
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
  Prisma,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getMercadoLibreAccessToken } from "./client";
import { enqueueMercadoLibreOutboxEvent } from "./queue";

const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_OUTBOX_EVENTS_PER_DISPATCH = 50;

type StockSyncTransaction = Pick<
  Prisma.TransactionClient,
  "product" | "marketplaceListing" | "marketplaceOutboxEvent"
>;

function getSafeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido";
  return message.slice(0, 1_000);
}

function getTargetQuantity(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(
      "La tarea de sincronización no contiene una cantidad válida",
    );
  }
  const targetQuantity = Number(
    (payload as Record<string, unknown>).targetQuantity,
  );
  if (!Number.isInteger(targetQuantity) || targetQuantity < 0) {
    throw new Error(
      "La tarea de sincronización no contiene una cantidad válida",
    );
  }
  return targetQuantity;
}

export async function queueMarketplaceStockSyncEvents(
  transaction: StockSyncTransaction,
  productIds: string[],
) {
  const uniqueProductIds = Array.from(new Set(productIds));
  if (uniqueProductIds.length === 0) return;

  const products = await transaction.product.findMany({
    where: { id: { in: uniqueProductIds } },
    select: { id: true, stock: true },
  });
  const stockByProductId = new Map(
    products.map((product) => [product.id, product.stock]),
  );
  const listings = await transaction.marketplaceListing.findMany({
    where: {
      productId: { in: uniqueProductIds },
      syncStock: true,
      externalItemId: { not: null },
    },
    select: {
      id: true,
      connectionId: true,
      productId: true,
      stockSafetyBuffer: true,
    },
  });

  await Promise.all(
    listings.map((listing) => {
      const stock = stockByProductId.get(listing.productId) ?? 0;
      const targetQuantity = Math.max(0, stock - listing.stockSafetyBuffer);
      const deduplicationKey = `${listing.connectionId}:stock:${listing.id}`;

      return transaction.marketplaceOutboxEvent.upsert({
        where: { deduplicationKey },
        update: {
          payload: { targetQuantity },
          status: MarketplaceOutboxStatus.PENDING,
          availableAt: new Date(),
          lastError: null,
        },
        create: {
          connectionId: listing.connectionId,
          listingId: listing.id,
          productId: listing.productId,
          action: MarketplaceOutboxAction.SYNC_STOCK,
          deduplicationKey,
          payload: { targetQuantity },
        },
      });
    }),
  );
}

export async function enqueuePendingMarketplaceOutboxEvents(
  connectionId: string,
) {
  const events = await prismadb.marketplaceOutboxEvent.findMany({
    where: {
      connectionId,
      status: {
        in: [MarketplaceOutboxStatus.PENDING, MarketplaceOutboxStatus.RETRY],
      },
      availableAt: { lte: new Date() },
    },
    select: { id: true, connectionId: true },
    orderBy: { createdAt: "asc" },
    take: MAX_OUTBOX_EVENTS_PER_DISPATCH,
  });

  for (const event of events) {
    await enqueueMercadoLibreOutboxEvent(event.id, event.connectionId);
  }

  return events.length;
}

export async function enqueuePendingMarketplaceOutboxEventsForStore(
  storeId: string,
) {
  const connections = await prismadb.marketplaceConnection.findMany({
    where: { storeId, status: "CONNECTED" },
    select: { id: true },
  });

  let enqueued = 0;
  for (const connection of connections) {
    enqueued += await enqueuePendingMarketplaceOutboxEvents(connection.id);
  }

  return enqueued;
}

async function updateMercadoLibreStock(
  connectionId: string,
  externalItemId: string,
  externalVariationId: string | null,
  targetQuantity: number,
) {
  const accessToken = await getMercadoLibreAccessToken(connectionId);
  const body = externalVariationId
    ? {
        variations: [
          {
            id: externalVariationId,
            available_quantity: targetQuantity,
          },
        ],
      }
    : { available_quantity: targetQuantity };
  const response = await fetch(
    `https://api.mercadolibre.com/items/${encodeURIComponent(externalItemId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Mercado Libre rechazó la sincronización de stock (${response.status})`,
    );
  }
}

export async function processMarketplaceOutboxEvent(eventId: string) {
  const event = await prismadb.marketplaceOutboxEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      connectionId: true,
      action: true,
      payload: true,
      status: true,
      listing: {
        select: {
          id: true,
          externalItemId: true,
          externalVariationId: true,
        },
      },
    },
  });
  if (!event) return { processed: false, reason: "not_found" as const };
  if (event.status === MarketplaceOutboxStatus.COMPLETED) {
    return { processed: false, reason: "already_processed" as const };
  }
  if (!event.listing?.externalItemId) {
    await prismadb.marketplaceOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: MarketplaceOutboxStatus.FAILED,
        lastError: "La publicación no tiene un identificador de Mercado Libre",
      },
    });
    return { processed: false, reason: "unpublished_listing" as const };
  }

  const claim = await prismadb.marketplaceOutboxEvent.updateMany({
    where: {
      id: event.id,
      status: {
        in: [MarketplaceOutboxStatus.PENDING, MarketplaceOutboxStatus.RETRY],
      },
    },
    data: {
      status: MarketplaceOutboxStatus.PROCESSING,
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (claim.count === 0) {
    return { processed: false, reason: "claimed_elsewhere" as const };
  }

  try {
    if (event.action !== MarketplaceOutboxAction.SYNC_STOCK) {
      throw new Error(
        "La acción de sincronización todavía no está implementada",
      );
    }
    const targetQuantity = getTargetQuantity(event.payload);
    await updateMercadoLibreStock(
      event.connectionId,
      event.listing.externalItemId,
      event.listing.externalVariationId,
      targetQuantity,
    );

    await prismadb.$transaction([
      prismadb.marketplaceOutboxEvent.update({
        where: { id: event.id },
        data: {
          status: MarketplaceOutboxStatus.COMPLETED,
          processedAt: new Date(),
          lastError: null,
        },
      }),
      prismadb.marketplaceListing.update({
        where: { id: event.listing.id },
        data: {
          lastSyncedStock: targetQuantity,
          lastError: null,
        },
      }),
      prismadb.marketplaceConnection.update({
        where: { id: event.connectionId },
        data: { lastSyncedAt: new Date(), lastError: null },
      }),
    ]);
    return { processed: true, reason: "processed" as const };
  } catch (error) {
    await prismadb.marketplaceOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: MarketplaceOutboxStatus.RETRY,
        availableAt: new Date(Date.now() + RETRY_DELAY_MS),
        lastError: getSafeErrorMessage(error),
      },
    });
    throw error;
  }
}
