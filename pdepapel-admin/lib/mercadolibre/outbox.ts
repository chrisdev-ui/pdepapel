import {
  MarketplaceConnectionStatus,
  MarketplaceListingStatus,
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
  MarketplaceOrderStatus,
  Prisma,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getMercadoLibreAccessToken, mutateMercadoLibreJson } from "./client";
import {
  getMercadoLibreOrderFinancials,
  MercadoLibreFinancialsPendingError,
  type MercadoLibreOrderFinancials,
} from "./order-financials";
import { withMercadoLibrePublicationFailure } from "./listing-metadata";
import {
  createMercadoLibreItem,
  createMercadoLibreItemDescription,
  getMarketplaceListingStatusFromRemote,
  MercadoLibrePublicationError,
  syncMercadoLibreListingContent,
} from "./listings";
import { enqueueMercadoLibreOutboxEvent } from "./queue";
import { REVENUE_MARKETPLACE_ORDER_STATUSES } from "./order-status";

const RETRY_DELAY_MS = 5 * 60 * 1000;
const FINANCIALS_PENDING_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const MAX_OUTBOX_EVENTS_PER_DISPATCH = 50;
/** Un evento que lleva más de esto en PROCESSING murió a medias (función cortada). */
const STALE_PROCESSING_EVENT_MS = 15 * 60 * 1000;
/**
 * Tope de intentos antes de FAILED («outbox_failed» en la salud). Una
 * liquidación aún no publicada no cuenta: ese estado es normal y se reintenta
 * cada 6 h hasta que Mercado Libre la publique.
 */
export const MAX_OUTBOX_EVENT_ATTEMPTS = 12;

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

/**
 * ¿Hay una publicación de esta ficha en curso (evento PUBLISH_LISTING en
 * PROCESSING)? La ruta de publicar, las acciones masivas y el borrado la
 * consultan para no duplicar el envío ni borrar una ficha a medio crear.
 */
export async function isMarketplaceListingPublicationInProgress(
  prisma: Prisma.TransactionClient | typeof prismadb,
  connectionId: string,
  listingId: string,
) {
  const event = await prisma.marketplaceOutboxEvent.findUnique({
    where: {
      deduplicationKey: getMarketplaceListingPublicationKey(
        connectionId,
        listingId,
      ),
    },
    select: { status: true },
  });
  return event?.status === MarketplaceOutboxStatus.PROCESSING;
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

export function getMarketplaceListingPublicationKey(
  connectionId: string,
  listingId: string,
) {
  return `${connectionId}:publish:${listingId}`;
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
  const deduplicationKey = getMarketplaceListingPublicationKey(
    connectionId,
    listingId,
  );
  // Nunca se pisa un evento en PROCESSING: otro proceso está creando el ítem
  // en este momento y devolverlo a PENDING permitiría una segunda creación.
  const reopened = await transaction.marketplaceOutboxEvent.updateMany({
    where: {
      deduplicationKey,
      status: { not: MarketplaceOutboxStatus.PROCESSING },
    },
    data: {
      payload: {},
      status: MarketplaceOutboxStatus.PENDING,
      availableAt: new Date(),
      lastError: null,
    },
  });
  if (reopened.count > 0) return;
  const existing = await transaction.marketplaceOutboxEvent.findUnique({
    where: { deduplicationKey },
    select: { id: true },
  });
  if (existing) return;
  await transaction.marketplaceOutboxEvent.create({
    data: {
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
    reset = false,
  }: {
    connectionId: string;
    externalOrderId: string;
    marketplaceOrderId: string;
    /** Volver a calcular un neto ya escrito (cambió el reembolso). */
    reset?: boolean;
  },
) {
  await transaction.marketplaceOutboxEvent.upsert({
    where: {
      deduplicationKey: `${connectionId}:order-financials:${externalOrderId}`,
    },
    update: reset
      ? {
          status: MarketplaceOutboxStatus.PENDING,
          availableAt: new Date(),
          lastError: null,
        }
      : {},
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
      status: { in: [...REVENUE_MARKETPLACE_ORDER_STATUSES] },
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

  // Misma barrida que los webhooks: una liquidación o un correo que quedó en
  // PROCESSING porque la función se cortó no tenía ningún camino de vuelta.
  await prismadb.marketplaceOutboxEvent.updateMany({
    where: {
      connectionId,
      status: MarketplaceOutboxStatus.PROCESSING,
      updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_EVENT_MS) },
    },
    data: {
      status: MarketplaceOutboxStatus.RETRY,
      availableAt: new Date(),
      lastError: "El procesamiento anterior no terminó y fue reintentado",
    },
  });

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

  await Promise.allSettled(
    events.map((event) =>
      enqueueMercadoLibreOutboxEvent(
        event.id,
        event.connectionId,
        event.action === MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION
          ? "notification"
          : "operation",
      ),
    ),
  );

  return events.length;
}

export async function enqueuePendingMarketplaceOutboxEventsForStore(
  storeId: string,
) {
  const connections = await prismadb.marketplaceConnection.findMany({
    where: { storeId, status: "CONNECTED" },
    select: { id: true },
  });

  const results = await Promise.allSettled(
    connections.map((connection) =>
      enqueuePendingMarketplaceOutboxEvents(connection.id),
    ),
  );

  return results.reduce(
    (acc, res) => acc + (res.status === "fulfilled" ? res.value : 0),
    0,
  );
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
  // Mercado Libre responde con el ítem: su `status` real manda (puede quedar
  // en revisión aunque se haya pedido activar). Un rechazo llega ya
  // clasificado por el cliente (429, 5xx, token vencido…).
  const payload = (await mutateMercadoLibreJson(
    connectionId,
    `/items/${encodeURIComponent(externalItemId)}`,
    { method: "PUT", body: { status: targetStatus } },
  )) as { status?: unknown } | null;
  return typeof payload?.status === "string" ? payload.status : null;
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
      attempts: true,
      availableAt: true,
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
              acqPrice: true,
              transportationCost: true,
              hasNoProductIdentifier: true,
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

  if (event.status === MarketplaceOutboxStatus.FAILED) {
    return { processed: false, reason: "failed" as const };
  }
  const now = new Date();
  if (event.availableAt > now) {
    return { processed: false, reason: "not_due" as const };
  }
  const claim = await prismadb.marketplaceOutboxEvent.updateMany({
    where: {
      id: event.id,
      status: {
        in: [MarketplaceOutboxStatus.PENDING, MarketplaceOutboxStatus.RETRY],
      },
      availableAt: { lte: now },
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
  const attempts = event.attempts + 1;

  // Fuera del try: el catch necesita saber si el ítem ya quedó creado.
  let publishedItem: {
    id: string;
    permalink: string | null;
    status: string | null;
    descriptionWarning: string | null;
  } | null = null;
  /** La publicación ya existía en Mercado Libre: el evento solo concilia. */
  let reconciledPublication = false;

  try {
    let syncedQuantity: number | null = null;
    /** Stock local leído justo antes de enviar la cantidad a Mercado Libre. */
    let stockSnapshot: number | null = null;
    let syncedPrice: number | null = null;
    let syncedListingContent = false;
    let syncedListingStatus: MarketplaceListingStatus | null = null;
    let syncedListingNote: string | null = null;
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
          refundedAmount: true,
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
          marketplaceOrder.refundedAmount ?? 0,
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
      // La cantidad guardada en el evento es la de cuando se encoló. Si el
      // stock volvió a cambiar mientras este evento esperaba, el nuevo upsert
      // pisó el payload pero la lectura de arriba ya lo había cargado. Lo que
      // manda es el stock de ahora; el payload solo sirve de respaldo.
      const liveProduct = await prismadb.product.findUnique({
        where: { id: event.listing!.product.id },
        select: { stock: true },
      });
      const targetQuantity =
        liveProduct === null
          ? getTargetQuantity(event.payload)
          : Math.max(0, liveProduct.stock - event.listing!.stockSafetyBuffer);
      stockSnapshot = liveProduct?.stock ?? null;
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
      const remoteStatus = await updateMercadoLibreListingStatus(
        event.connectionId,
        event.listing!.externalItemId!,
        targetStatus,
      );
      // Misma tabla de estados que la publicación: lo que Mercado Libre
      // devuelve, no lo que se pidió.
      const mapped = getMarketplaceListingStatusFromRemote(
        remoteStatus ?? targetStatus,
      );
      syncedListingStatus = mapped.status;
      syncedListingNote = mapped.note;
    } else if (event.action === MarketplaceOutboxAction.PUBLISH_LISTING) {
      if (event.listing!.externalItemId) {
        // Ya está publicada (por la ruta, por importación o por un intento
        // anterior que guardó el id): no se vuelve a crear ni se marca error.
        reconciledPublication = true;
      } else {
        const created = await createMercadoLibreItem({
          id: event.listing!.id,
          connectionId: event.listing!.connectionId,
          categoryId: event.listing!.categoryId,
          listingType: event.listing!.listingType,
          marketplacePrice: event.listing!.marketplacePrice,
          stockSafetyBuffer: event.listing!.stockSafetyBuffer,
          metadata: event.listing!.metadata,
          product: event.listing!.product,
        });
        // El id se guarda YA, antes de la descripción y de cualquier otra
        // escritura: desde este punto la publicación existe y ningún
        // reintento puede crearla dos veces.
        const remote = getMarketplaceListingStatusFromRemote(created.status);
        await prismadb.marketplaceListing.update({
          where: { id: event.listing!.id },
          data: {
            externalItemId: created.id,
            externalPermalink: created.permalink,
            status: remote.status,
            lastSyncedStock: Math.max(
              0,
              event.listing!.product.stock - event.listing!.stockSafetyBuffer,
            ),
            lastSyncedPrice: event.listing!.marketplacePrice,
            lastRemoteUpdateAt: new Date(),
            lastError: remote.note,
            metadata: withMercadoLibrePublicationFailure(
              event.listing!.metadata,
              null,
            ),
          },
        });
        // El stock pudo moverse mientras se publicaba: se sincroniza ya.
        await queueMarketplaceStockSyncEvents(prismadb, [
          event.listing!.product.id,
        ]);
        publishedItem = {
          ...created,
          descriptionWarning: await createMercadoLibreItemDescription(
            event.listing!.connectionId,
            created.id,
            event.listing!.product.description,
          ),
        };
      }
    } else {
      throw new Error(
        "La acción de sincronización todavía no está implementada",
      );
    }

    const superseded = await prismadb.$transaction(async (transaction) => {
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
      // Solo se cierra si nadie volvió a pedir la misma sincronización
      // mientras corría. Si el upsert la dejó otra vez en PENDING (o el stock
      // cambió desde que se leyó), lo enviado ya está viejo: se deja abierta y
      // se vuelve a encolar en vez de marcarla COMPLETED encima.
      const stockMoved =
        stockSnapshot !== null &&
        (
          await transaction.product.findUnique({
            where: { id: event.listing!.product.id },
            select: { stock: true },
          })
        )?.stock !== stockSnapshot;
      const completed = stockMoved
        ? { count: 0 }
        : await transaction.marketplaceOutboxEvent.updateMany({
            where: { id: event.id, status: MarketplaceOutboxStatus.PROCESSING },
            data: {
              status: MarketplaceOutboxStatus.COMPLETED,
              processedAt: new Date(),
              lastError: null,
            },
          });
      if (completed.count === 0) {
        await transaction.marketplaceOutboxEvent.updateMany({
          where: { id: event.id, status: MarketplaceOutboxStatus.PROCESSING },
          data: { status: MarketplaceOutboxStatus.PENDING, availableAt: new Date() },
        });
      }
      if (
        event.listing &&
        !reconciledPublication &&
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
                  status: getMarketplaceListingStatusFromRemote(
                    publishedItem.status,
                  ).status,
                  lastSyncedStock: Math.max(
                    0,
                    event.listing.product.stock -
                      event.listing.stockSafetyBuffer,
                  ),
                  lastSyncedPrice: event.listing.marketplacePrice,
                }
              : {}),
            lastError: publishedItem
              ? [
                  getMarketplaceListingStatusFromRemote(publishedItem.status)
                    .note,
                  publishedItem.descriptionWarning,
                ]
                  .filter(Boolean)
                  .join(" ") || null
              : syncedListingNote,
          },
        });
      }
      if (reconciledPublication && event.listing) {
        // Solo se corrige un estado local equivocado (DRAFT/ERROR con id
        // remoto); PAUSED o CLOSED se respetan porque los dice Mercado Libre.
        await transaction.marketplaceListing.updateMany({
          where: {
            id: event.listing.id,
            status: {
              in: [
                MarketplaceListingStatus.DRAFT,
                MarketplaceListingStatus.ERROR,
              ],
            },
          },
          data: { status: MarketplaceListingStatus.ACTIVE, lastError: null },
        });
      }
      await transaction.marketplaceConnection.update({
        where: { id: event.connectionId },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
      return completed.count === 0;
    });
    if (superseded) {
      try {
        await enqueueMercadoLibreOutboxEvent(
          event.id,
          event.connectionId,
          event.action === MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION
            ? "notification"
            : "operation",
        );
      } catch (enqueueError) {
        console.error("Mercado Libre outbox re-enqueue deferred", {
          eventId: event.id,
          message:
            enqueueError instanceof Error ? enqueueError.message : "unknown",
        });
      }
      return { processed: true, reason: "superseded" as const };
    }
    return { processed: true, reason: "processed" as const };
  } catch (error) {
    const financialsPending =
      error instanceof MercadoLibreFinancialsPendingError;
    const errorMessage = getSafeErrorMessage(error);
    const publicationFailure =
      error instanceof MercadoLibrePublicationError ? error.toFailure() : null;
    const publicationNeedsReview = publicationFailure?.kind === "review";
    const exhausted =
      !financialsPending &&
      !publicationNeedsReview &&
      attempts >= MAX_OUTBOX_EVENT_ATTEMPTS;
    if (
      event.action === MarketplaceOutboxAction.PUBLISH_LISTING &&
      event.listing?.id &&
      // Si el ítem ya se creó y su id quedó guardado, un fallo posterior no
      // convierte la publicación en ERROR: el reintento la concilia.
      publishedItem === null &&
      !reconciledPublication
    ) {
      // review → DRAFT (la persona corrige); transitorio o reautenticación →
      // el estado se queda como estaba y solo cambia el mensaje, porque el
      // reintento es automático; agotado o desconocido → ERROR.
      const keepStatus =
        publicationFailure?.kind === "transient" ||
        publicationFailure?.kind === "reauth";
      await prismadb.marketplaceListing.update({
        where: { id: event.listing.id },
        data: {
          ...(publicationNeedsReview
            ? { status: MarketplaceListingStatus.DRAFT }
            : keepStatus && !exhausted
              ? {}
              : { status: MarketplaceListingStatus.ERROR }),
          lastError: errorMessage,
          metadata: withMercadoLibrePublicationFailure(
            event.listing.metadata,
            publicationFailure ?? {
              kind: "unknown",
              step: null,
              field: null,
              code: null,
              message: errorMessage,
            },
          ),
        },
      });
      if (publicationFailure?.kind === "reauth") {
        await prismadb.marketplaceConnection.update({
          where: { id: event.connectionId },
          data: {
            status: MarketplaceConnectionStatus.REAUTH_REQUIRED,
            lastError: errorMessage,
          },
        });
      }
    }
    if (
      event.action === MarketplaceOutboxAction.SYNC_LISTING_CONTENT &&
      event.listing?.id
    ) {
      // Un contenido que no llegó a Mercado Libre se ve en la fila, no solo
      // en la cola: antes fallaba doce veces sin dejar rastro en la ficha.
      await prismadb.marketplaceListing.update({
        where: { id: event.listing.id },
        data: {
          lastError: exhausted
            ? `No fue posible sincronizar el contenido tras ${MAX_OUTBOX_EVENT_ATTEMPTS} intentos: ${errorMessage}`
            : `Sincronización de contenido pendiente de reintento: ${errorMessage}`,
        },
      });
    }
    await prismadb.marketplaceOutboxEvent.update({
      where: { id: event.id },
      data: {
        status:
          publicationNeedsReview || exhausted
            ? MarketplaceOutboxStatus.FAILED
            : MarketplaceOutboxStatus.RETRY,
        ...(publicationNeedsReview || exhausted
          ? {}
          : {
              availableAt: new Date(
                Date.now() +
                  (financialsPending
                    ? FINANCIALS_PENDING_RETRY_DELAY_MS
                    : RETRY_DELAY_MS),
              ),
            }),
        lastError: exhausted
          ? `Se agotaron los ${MAX_OUTBOX_EVENT_ATTEMPTS} intentos. Último error: ${errorMessage}`
          : errorMessage,
      },
    });
    if (publicationNeedsReview) {
      return { processed: false, reason: "listing_requires_review" as const };
    }
    if (financialsPending) {
      return { processed: false, reason: "financials_pending" as const };
    }
    if (exhausted) {
      console.error("Mercado Libre outbox event failed permanently", {
        eventId: event.id,
        action: event.action,
        lastError: errorMessage,
      });
      return { processed: false, reason: "failed" as const };
    }
    // 200 a propósito: los reintentos inmediatos de QStash solo verían
    // «not_due»; la recuperación programada lo reintenta cuando venza.
    console.warn("Mercado Libre outbox event scheduled for retry", {
      eventId: event.id,
      action: event.action,
      attempts,
      lastError: errorMessage,
    });
    return { processed: false, reason: "retry_scheduled" as const };
  }
}
