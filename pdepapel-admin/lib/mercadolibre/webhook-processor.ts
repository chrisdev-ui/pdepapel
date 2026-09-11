import { MarketplaceWebhookEventStatus } from "@prisma/client";

import { invalidateStoreProductsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";

import { getMercadoLibreResource } from "./client";
import {
  synchronizeMercadoLibreClaim,
  synchronizeMercadoLibreShipment,
} from "./logistics";
import { synchronizeMercadoLibreOrder } from "./order-sync";
import { synchronizeMercadoLibreQuestion } from "./questions";
import { enqueueMercadoLibreWebhookEvent } from "./queue";

const RETRY_DELAY_MS = 5 * 60 * 1000;
const STALE_PROCESSING_EVENT_MS = 15 * 60 * 1000;
const MAX_EVENTS_PER_RECOVERY = 50;
/**
 * Después de estos intentos el evento pasa a FAILED y aparece en la salud de
 * Mercado Libre («webhook_failed»). Antes no había tope: una orden imposible
 * de leer se volvía a pedir a Mercado Libre cada recuperación, para siempre.
 */
export const MAX_WEBHOOK_EVENT_ATTEMPTS = 12;

/** Filtro compartido: solo eventos cuyo reintento ya venció. */
function dueFilter(now: Date) {
  return { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] };
}

function isOrderTopic(topic: string) {
  return topic === "orders" || topic === "orders_v2";
}

function isQuestionTopic(topic: string) {
  return topic === "questions";
}

function isShipmentTopic(topic: string) {
  return topic === "shipments";
}

function isClaimTopic(topic: string) {
  return topic === "claims" || topic === "claims_actions";
}

function getSafeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido";
  return message.slice(0, 1_000);
}

export async function processMercadoLibreWebhookEvent(eventId: string) {
  const event = await prismadb.marketplaceWebhookEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      connectionId: true,
      topic: true,
      resource: true,
      status: true,
      attempts: true,
      nextRetryAt: true,
      connection: { select: { storeId: true } },
    },
  });

  if (!event) return { processed: false, reason: "not_found" as const };
  if (event.status === MarketplaceWebhookEventStatus.PROCESSED) {
    return { processed: false, reason: "already_processed" as const };
  }
  if (!event.connectionId || !event.connection) {
    await prismadb.marketplaceWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: MarketplaceWebhookEventStatus.FAILED,
        lastError:
          "No hay una conexión de Mercado Libre para el vendedor recibido",
      },
    });
    return { processed: false, reason: "unknown_connection" as const };
  }

  if (event.status === MarketplaceWebhookEventStatus.FAILED) {
    return { processed: false, reason: "failed" as const };
  }
  const now = new Date();
  // El reintento tiene fecha: antes se ignoraba y un 429 de Mercado Libre se
  // volvía a intentar en segundos. Si aún no toca, se responde 200 para que la
  // cola no insista; la recuperación lo retoma cuando venza.
  if (event.nextRetryAt && event.nextRetryAt > now) {
    return { processed: false, reason: "not_due" as const };
  }
  const claim = await prismadb.marketplaceWebhookEvent.updateMany({
    where: {
      id: event.id,
      status: {
        in: [
          MarketplaceWebhookEventStatus.PENDING,
          MarketplaceWebhookEventStatus.RETRY,
        ],
      },
      ...dueFilter(now),
    },
    data: {
      status: MarketplaceWebhookEventStatus.PROCESSING,
      attempts: { increment: 1 },
      nextRetryAt: null,
      lastError: null,
    },
  });
  if (claim.count === 0) {
    return { processed: false, reason: "claimed_elsewhere" as const };
  }
  const attempts = event.attempts + 1;

  try {
    const isSupportedTopic =
      isOrderTopic(event.topic) ||
      isQuestionTopic(event.topic) ||
      isShipmentTopic(event.topic) ||
      isClaimTopic(event.topic);
    const payload = isSupportedTopic
      ? await getMercadoLibreResource(event.connectionId, event.resource)
      : null;
    if (isOrderTopic(event.topic) && payload) {
      const result = await synchronizeMercadoLibreOrder(
        event.connectionId,
        event.connection.storeId,
        payload,
      );
      if (result.inventoryChanged) {
        await invalidateStoreProductsCache(event.connection.storeId);
      }
    } else if (isQuestionTopic(event.topic) && payload) {
      await synchronizeMercadoLibreQuestion(event.connectionId, payload);
    } else if (isShipmentTopic(event.topic) && payload) {
      await synchronizeMercadoLibreShipment(event.connectionId, payload);
    } else if (isClaimTopic(event.topic) && payload) {
      await synchronizeMercadoLibreClaim(event.connectionId, payload);
    }

    await prismadb.marketplaceWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: MarketplaceWebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        nextRetryAt: null,
        lastError: null,
      },
    });
    return { processed: true, reason: "processed" as const };
  } catch (error) {
    const lastError = getSafeErrorMessage(error);
    if (attempts >= MAX_WEBHOOK_EVENT_ATTEMPTS) {
      await prismadb.marketplaceWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: MarketplaceWebhookEventStatus.FAILED,
          nextRetryAt: null,
          lastError: `Se agotaron los ${MAX_WEBHOOK_EVENT_ATTEMPTS} intentos. Último error: ${lastError}`,
        },
      });
      console.error("Mercado Libre webhook event failed permanently", {
        eventId: event.id,
        topic: event.topic,
        lastError,
      });
      return { processed: false, reason: "failed" as const };
    }
    await prismadb.marketplaceWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: MarketplaceWebhookEventStatus.RETRY,
        nextRetryAt: new Date(Date.now() + RETRY_DELAY_MS),
        lastError,
      },
    });
    // Se responde 200 a propósito: los reintentos inmediatos de QStash solo
    // encontrarían «not_due». La recuperación programada lo reintenta.
    console.warn("Mercado Libre webhook event scheduled for retry", {
      eventId: event.id,
      attempts,
      lastError,
    });
    return { processed: false, reason: "retry_scheduled" as const };
  }
}

export async function recoverMercadoLibreWebhookEvents(connectionId: string) {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_EVENT_MS);
  await prismadb.marketplaceWebhookEvent.updateMany({
    where: {
      connectionId,
      status: MarketplaceWebhookEventStatus.PROCESSING,
      updatedAt: { lt: staleBefore },
    },
    data: {
      status: MarketplaceWebhookEventStatus.RETRY,
      nextRetryAt: new Date(),
      lastError: "El procesamiento anterior no terminó y fue reintentado",
    },
  });

  const events = await prismadb.marketplaceWebhookEvent.findMany({
    where: {
      connectionId,
      status: {
        in: [
          MarketplaceWebhookEventStatus.PENDING,
          MarketplaceWebhookEventStatus.RETRY,
        ],
      },
      ...dueFilter(new Date()),
    },
    select: { id: true, connectionId: true },
    orderBy: { createdAt: "asc" },
    take: MAX_EVENTS_PER_RECOVERY,
  });

  for (const event of events) {
    await enqueueMercadoLibreWebhookEvent(event.id, event.connectionId!);
  }

  return events.length;
}
