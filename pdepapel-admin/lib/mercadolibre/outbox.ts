import {
  MarketplaceListingStatus,
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
  MarketplaceOrderStatus,
  Prisma,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getMercadoLibreAccessToken } from "./client";
import {
  getMercadoLibreOrderFinancials,
  MercadoLibreFinancialsPendingError,
  type MercadoLibreOrderFinancials,
} from "./order-financials";
import { syncMercadoLibreListingContent } from "./listings";
import { publishMercadoLibreListing } from "./listings";
import { enqueueMercadoLibreOutboxEvent } from "./queue";

const RETRY_DELAY_MS = 5 * 60 * 1000;
const FINANCIALS_PENDING_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const MAX_OUTBOX_EVENTS_PER_DISPATCH = 50;

type StockSyncTransaction = Pick<
  Prisma.TransactionClient,
  "product" | "marketplaceListing" | "marketplaceOutboxEvent"
>;

type MarketplaceNotificationTransaction = Pick<
  Prisma.TransactionClient,
  "marketplaceOutboxEvent"
>;

type MarketplaceFinancialsTransaction = Pick<
  Prisma.TransactionClient,
  "marketplaceOutboxEvent"
>;

type MarketplaceListingSyncTransaction = Pick<
  Prisma.TransactionClient,
  "marketplaceOutboxEvent"
>;

type MarketplaceOrderFinancialsUpdate = {
  marketplaceOrderId: string;
  financials: MercadoLibreOrderFinancials;
  metadata: Prisma.InputJsonValue;
};

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

function getTargetPrice(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("La tarea de sincronización no contiene un precio válido");
  }
  const targetPrice = Number((payload as Record<string, unknown>).targetPrice);
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new Error("La tarea de sincronización no contiene un precio válido");
  }
  return targetPrice;
}

function getTargetListingStatus(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("La tarea de sincronización no contiene un estado válido");
  }
  const targetStatus = (payload as Record<string, unknown>).targetStatus;
  if (targetStatus !== "active" && targetStatus !== "paused") {
    throw new Error("La tarea de sincronización no contiene un estado válido");
  }
  return targetStatus;
}

function toMarketplaceListingStatus(status: string) {
  return status === "active"
    ? MarketplaceListingStatus.ACTIVE
    : MarketplaceListingStatus.PAUSED;
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

export async function queueMarketplacePriceSyncEvent(
  transaction: MarketplaceListingSyncTransaction,
  {
    connectionId,
    listingId,
    productId,
    targetPrice,
  }: {
    connectionId: string;
    listingId: string;
    productId: string;
    targetPrice: number;
  },
) {
  const deduplicationKey = `${connectionId}:price:${listingId}`;
  await transaction.marketplaceOutboxEvent.upsert({
    where: { deduplicationKey },
    update: {
      payload: { targetPrice },
      status: MarketplaceOutboxStatus.PENDING,
      availableAt: new Date(),
      lastError: null,
    },
    create: {
      connectionId,
      listingId,
      productId,
      action: MarketplaceOutboxAction.SYNC_PRICE,
      deduplicationKey,
      payload: { targetPrice },
    },
  });
}

export async function queueMarketplaceListingContentSyncEvent(
  transaction: MarketplaceListingSyncTransaction,
  {
    connectionId,
    listingId,
    productId,
  }: {
    connectionId: string;
    listingId: string;
    productId: string;
  },
) {
  const deduplicationKey = `${connectionId}:content:${listingId}`;
  await transaction.marketplaceOutboxEvent.upsert({
    where: { deduplicationKey },
    update: {
      payload: {},
      status: MarketplaceOutboxStatus.PENDING,
      availableAt: new Date(),
      lastError: null,
    },
    create: {
      connectionId,
      listingId,
      productId,
      action: MarketplaceOutboxAction.SYNC_LISTING_CONTENT,
      deduplicationKey,
      payload: {},
    },
  });
}

export async function queueMarketplaceListingStatusSyncEvent(
  transaction: MarketplaceListingSyncTransaction,
  {
    connectionId,
    listingId,
    productId,
    targetStatus,
  }: {
    connectionId: string;
    listingId: string;
    productId: string;
    targetStatus: "active" | "paused";
  },
) {
  const deduplicationKey = `${connectionId}:status:${listingId}`;
  await transaction.marketplaceOutboxEvent.upsert({
    where: { deduplicationKey },
    update: {
      payload: { targetStatus },
      status: MarketplaceOutboxStatus.PENDING,
      availableAt: new Date(),
      lastError: null,
    },
    create: {
      connectionId,
      listingId,
      productId,
      action: MarketplaceOutboxAction.SYNC_LISTING_STATUS,
      deduplicationKey,
      payload: { targetStatus },
    },
  });
}

export async function queueMarketplaceListingPublicationEvent(
  transaction: MarketplaceListingSyncTransaction,
  {
    connectionId,
    listingId,
    productId,
  }: {
    connectionId: string;
    listingId: string;
    productId: string;
  },
) {
  const deduplicationKey = `${connectionId}:publish:${listingId}`;
  await transaction.marketplaceOutboxEvent.upsert({
    where: { deduplicationKey },
    update: {
      payload: {},
      status: MarketplaceOutboxStatus.PENDING,
      availableAt: new Date(),
      lastError: null,
    },
    create: {
      connectionId,
      listingId,
      productId,
      action: MarketplaceOutboxAction.PUBLISH_LISTING,
      deduplicationKey,
      payload: {},
    },
  });
}

export async function queueMarketplaceOrderNotification(
  transaction: MarketplaceNotificationTransaction,
  {
    connectionId,
    externalOrderId,
    marketplaceOrderId,
  }: {
    connectionId: string;
    externalOrderId: string;
    marketplaceOrderId: string;
  },
) {
  await transaction.marketplaceOutboxEvent.upsert({
    where: {
      deduplicationKey: `${connectionId}:order-notification:${externalOrderId}`,
    },
    update: {},
    create: {
      connectionId,
      action: MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION,
      deduplicationKey: `${connectionId}:order-notification:${externalOrderId}`,
      payload: { marketplaceOrderId },
    },
  });
}

export async function queueMarketplaceOrderFinancials(
  transaction: MarketplaceFinancialsTransaction,
  {
    connectionId,
    externalOrderId,
    marketplaceOrderId,
  }: {
    connectionId: string;
    externalOrderId: string;
    marketplaceOrderId: string;
  },
) {
  await transaction.marketplaceOutboxEvent.upsert({
    where: {
      deduplicationKey: `${connectionId}:order-financials:${externalOrderId}`,
    },
    update: {},
    create: {
      connectionId,
      action: MarketplaceOutboxAction.SYNC_ORDER_FINANCIALS,
      deduplicationKey: `${connectionId}:order-financials:${externalOrderId}`,
      payload: { marketplaceOrderId },
    },
  });
}

async function queuePendingMarketplaceOrderFinancials(connectionId: string) {
  const orders = await prismadb.marketplaceOrder.findMany({
    where: {
      connectionId,
      status: MarketplaceOrderStatus.PAID,
      netAmount: null,
    },
    select: { id: true, externalOrderId: true },
    take: MAX_OUTBOX_EVENTS_PER_DISPATCH,
  });

  await Promise.all(
    orders.map((order) =>
      queueMarketplaceOrderFinancials(prismadb, {
        connectionId,
        externalOrderId: order.externalOrderId,
        marketplaceOrderId: order.id,
      }),
    ),
  );
}

export async function enqueuePendingMarketplaceOutboxEvents(
  connectionId: string,
) {
  await queuePendingMarketplaceOrderFinancials(connectionId);

  const events = await prismadb.marketplaceOutboxEvent.findMany({
    where: {
      connectionId,
      status: {
        in: [MarketplaceOutboxStatus.PENDING, MarketplaceOutboxStatus.RETRY],
      },
      availableAt: { lte: new Date() },
    },
    select: { id: true, connectionId: true, action: true },
    orderBy: { createdAt: "asc" },
    take: MAX_OUTBOX_EVENTS_PER_DISPATCH,
  });

  for (const event of events) {
    await enqueueMercadoLibreOutboxEvent(
      event.id,
      event.connectionId,
      event.action === MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION
        ? "notification"
        : "operation",
    );
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

async function updateMercadoLibrePrice(
  connectionId: string,
  externalItemId: string,
  targetPrice: number,
) {
  const accessToken = await getMercadoLibreAccessToken(connectionId);
  const response = await fetch(
    `https://api.mercadolibre.com/items/${encodeURIComponent(externalItemId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ price: targetPrice }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Mercado Libre rechazó la sincronización de precio (${response.status})`,
    );
  }
}

async function updateMercadoLibreListingStatus(
  connectionId: string,
  externalItemId: string,
  targetStatus: "active" | "paused",
) {
  const accessToken = await getMercadoLibreAccessToken(connectionId);
  const response = await fetch(
    `https://api.mercadolibre.com/items/${encodeURIComponent(externalItemId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: targetStatus }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Mercado Libre rechazó la actualización de estado (${response.status})`,
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
          connectionId: true,
          externalItemId: true,
          externalVariationId: true,
          categoryId: true,
          listingType: true,
          marketplacePrice: true,
          stockSafetyBuffer: true,
          metadata: true,
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
      },
    },
  });
  if (!event) return { processed: false, reason: "not_found" as const };
  if (event.status === MarketplaceOutboxStatus.COMPLETED) {
    return { processed: false, reason: "already_processed" as const };
  }
  if (
    event.action !== MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION &&
    event.action !== MarketplaceOutboxAction.SYNC_ORDER_FINANCIALS &&
    event.action !== MarketplaceOutboxAction.PUBLISH_LISTING &&
    !event.listing?.externalItemId
  ) {
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
    let syncedQuantity: number | null = null;
    let syncedPrice: number | null = null;
    let syncedListingContent = false;
    let syncedListingStatus: MarketplaceListingStatus | null = null;
    let publishedItem: {
      id: string;
      permalink: string | null;
      status: string | null;
      descriptionWarning: string | null;
    } | null = null;
    let financialsUpdate: MarketplaceOrderFinancialsUpdate | null = null;
    if (event.action === MarketplaceOutboxAction.SYNC_ORDER_FINANCIALS) {
      const payload = event.payload as Record<string, unknown> | null;
      const marketplaceOrderId =
        payload && typeof payload.marketplaceOrderId === "string"
          ? payload.marketplaceOrderId
          : null;
      if (!marketplaceOrderId) {
        throw new Error(
          "La liquidación de venta no contiene un identificador de orden válido",
        );
      }
      const marketplaceOrder = await prismadb.marketplaceOrder.findUnique({
        where: { id: marketplaceOrderId },
        select: {
          id: true,
          connectionId: true,
          externalOrderId: true,
          totalAmount: true,
          metadata: true,
        },
      });
      if (
        !marketplaceOrder ||
        marketplaceOrder.connectionId !== event.connectionId
      ) {
        throw new Error("No fue posible encontrar la venta de Mercado Libre");
      }

      const metadata = marketplaceOrder.metadata;
      const isHistoricalReconciliation =
        metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        (metadata as Record<string, unknown>).source ===
          "HISTORICAL_RECONCILIATION";
      if (!isHistoricalReconciliation) {
        if (marketplaceOrder.totalAmount === null) {
          throw new MercadoLibreFinancialsPendingError(
            "La venta no tiene un total válido para calcular el neto",
          );
        }
        const financials = await getMercadoLibreOrderFinancials(
          event.connectionId,
          marketplaceOrder.externalOrderId,
          marketplaceOrder.totalAmount,
        );
        financialsUpdate = {
          marketplaceOrderId: marketplaceOrder.id,
          financials,
          metadata: {
            ...(metadata &&
            typeof metadata === "object" &&
            !Array.isArray(metadata)
              ? metadata
              : {}),
            taxesAmount: financials.taxesAmount,
            financials: {
              source: "MERCADOLIBRE_BILLING",
              status: "READY",
              updatedAt: new Date().toISOString(),
              moneyReleaseDate: financials.moneyReleaseDate,
              moneyReleaseStatus: financials.moneyReleaseStatus,
            },
          },
        };
      }
    } else if (
      event.action === MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION
    ) {
      const payload = event.payload as Record<string, unknown> | null;
      const marketplaceOrderId =
        payload && typeof payload.marketplaceOrderId === "string"
          ? payload.marketplaceOrderId
          : null;
      if (!marketplaceOrderId) {
        throw new Error(
          "La notificación de venta no contiene un identificador de orden válido",
        );
      }
      const marketplaceOrder = await prismadb.marketplaceOrder.findUnique({
        where: { id: marketplaceOrderId },
        select: {
          id: true,
          connectionId: true,
          externalOrderId: true,
          buyerName: true,
          paidAt: true,
          netAmount: true,
          inventoryStatus: true,
          connection: { select: { storeId: true } },
          items: {
            select: {
              title: true,
              quantity: true,
              product: { select: { name: true, sku: true } },
            },
          },
        },
      });
      if (
        !marketplaceOrder ||
        marketplaceOrder.connectionId !== event.connectionId
      ) {
        throw new Error("No fue posible encontrar la venta de Mercado Libre");
      }
      const { sendMercadoLibreOrderNotification } =
        await import("./order-notification");
      await sendMercadoLibreOrderNotification({
        buyerName: marketplaceOrder.buyerName,
        inventoryStatus: marketplaceOrder.inventoryStatus,
        marketplaceOrderId: marketplaceOrder.id,
        orderNumber: marketplaceOrder.externalOrderId,
        paidAt: marketplaceOrder.paidAt,
        orderSummary: marketplaceOrder.items
          .map(
            (item) =>
              `• ${item.quantity} × ${item.product?.name ?? item.title}${item.product?.sku ? ` (${item.product.sku})` : ""}`,
          )
          .join("\n"),
        storeId: marketplaceOrder.connection.storeId,
        netAmount: marketplaceOrder.netAmount,
      });
    } else if (event.action === MarketplaceOutboxAction.SYNC_STOCK) {
      const targetQuantity = getTargetQuantity(event.payload);
      await updateMercadoLibreStock(
        event.connectionId,
        event.listing!.externalItemId!,
        event.listing!.externalVariationId,
        targetQuantity,
      );
      syncedQuantity = targetQuantity;
    } else if (event.action === MarketplaceOutboxAction.SYNC_PRICE) {
      const targetPrice = getTargetPrice(event.payload);
      await updateMercadoLibrePrice(
        event.connectionId,
        event.listing!.externalItemId!,
        targetPrice,
      );
      syncedPrice = targetPrice;
    } else if (event.action === MarketplaceOutboxAction.SYNC_LISTING_CONTENT) {
      await syncMercadoLibreListingContent({
        id: event.listing!.id,
        connectionId: event.listing!.connectionId,
        externalItemId: event.listing!.externalItemId!,
        categoryId: event.listing!.categoryId,
        listingType: event.listing!.listingType,
        marketplacePrice: event.listing!.marketplacePrice,
        stockSafetyBuffer: event.listing!.stockSafetyBuffer,
        metadata: event.listing!.metadata,
        product: event.listing!.product,
      });
      syncedListingContent = true;
    } else if (event.action === MarketplaceOutboxAction.SYNC_LISTING_STATUS) {
      const targetStatus = getTargetListingStatus(event.payload);
      await updateMercadoLibreListingStatus(
        event.connectionId,
        event.listing!.externalItemId!,
        targetStatus,
      );
      syncedListingStatus = toMarketplaceListingStatus(targetStatus);
    } else if (event.action === MarketplaceOutboxAction.PUBLISH_LISTING) {
      if (event.listing!.externalItemId) {
        throw new Error(
          "La publicación ya tiene un identificador de Mercado Libre",
        );
      }
      publishedItem = await publishMercadoLibreListing({
        id: event.listing!.id,
        connectionId: event.listing!.connectionId,
        categoryId: event.listing!.categoryId,
        listingType: event.listing!.listingType,
        marketplacePrice: event.listing!.marketplacePrice,
        stockSafetyBuffer: event.listing!.stockSafetyBuffer,
        metadata: event.listing!.metadata,
        product: event.listing!.product,
      });
    } else {
      throw new Error(
        "La acción de sincronización todavía no está implementada",
      );
    }

    await prismadb.$transaction(async (transaction) => {
      if (financialsUpdate) {
        await transaction.marketplaceOrder.update({
          where: { id: financialsUpdate.marketplaceOrderId },
          data: {
            marketplaceFee: financialsUpdate.financials.marketplaceFee,
            shippingCost: financialsUpdate.financials.shippingCost,
            netAmount: financialsUpdate.financials.netAmount,
            metadata: financialsUpdate.metadata,
          },
        });
      }
      await transaction.marketplaceOutboxEvent.update({
        where: { id: event.id },
        data: {
          status: MarketplaceOutboxStatus.COMPLETED,
          processedAt: new Date(),
          lastError: null,
        },
      });
      if (
        event.listing &&
        (syncedQuantity !== null ||
          syncedPrice !== null ||
          syncedListingContent ||
          syncedListingStatus !== null ||
          publishedItem)
      ) {
        await transaction.marketplaceListing.update({
          where: { id: event.listing.id },
          data: {
            ...(syncedQuantity !== null
              ? { lastSyncedStock: syncedQuantity }
              : {}),
            ...(syncedPrice !== null ? { lastSyncedPrice: syncedPrice } : {}),
            ...(syncedPrice !== null ||
            syncedListingContent ||
            syncedListingStatus !== null ||
            publishedItem
              ? { lastRemoteUpdateAt: new Date() }
              : {}),
            ...(syncedListingStatus !== null
              ? { status: syncedListingStatus }
              : {}),
            ...(publishedItem
              ? {
                  externalItemId: publishedItem.id,
                  externalPermalink: publishedItem.permalink,
                  status:
                    publishedItem.status === "active"
                      ? MarketplaceListingStatus.ACTIVE
                      : MarketplaceListingStatus.PAUSED,
                  lastSyncedStock: Math.max(
                    0,
                    event.listing.product.stock -
                      event.listing.stockSafetyBuffer,
                  ),
                  lastSyncedPrice: event.listing.marketplacePrice,
                }
              : {}),
            lastError: publishedItem?.descriptionWarning ?? null,
          },
        });
      }
      await transaction.marketplaceConnection.update({
        where: { id: event.connectionId },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
    });
    return { processed: true, reason: "processed" as const };
  } catch (error) {
    const financialsPending =
      error instanceof MercadoLibreFinancialsPendingError;
    const errorMessage = getSafeErrorMessage(error);
    if (
      event.action === MarketplaceOutboxAction.PUBLISH_LISTING &&
      event.listing?.id
    ) {
      await prismadb.marketplaceListing.update({
        where: { id: event.listing.id },
        data: {
          status: MarketplaceListingStatus.ERROR,
          lastError: errorMessage,
        },
      });
    }
    await prismadb.marketplaceOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: MarketplaceOutboxStatus.RETRY,
        availableAt: new Date(
          Date.now() +
            (financialsPending
              ? FINANCIALS_PENDING_RETRY_DELAY_MS
              : RETRY_DELAY_MS),
        ),
        lastError: errorMessage,
      },
    });
    if (financialsPending) {
      return { processed: false, reason: "financials_pending" as const };
    }
    throw error;
  }
}
