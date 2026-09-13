import {
  ConversationChannel,
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
  MarketplaceProvider,
  MarketplaceWebhookEventStatus,
} from "@prisma/client";

import { normalizePhone } from "@/lib/customer-views";
import prismadb from "@/lib/prismadb";

/**
 * Convierte un `MarketplaceWebhookEvent` de WhatsApp en historial: una
 * `Conversation` por teléfono y un `ConversationMessage` por mensaje entrante;
 * los estados de entrega (`statuses`) actualizan el mensaje al que apuntan.
 *
 * El trabajo es «archivar con fidelidad», no «entender todo»: un mensaje con
 * una forma desconocida se salta y se registra; solo los fallos reales (base
 * de datos) pasan por el reintento.
 */

const RETRY_DELAY_MS = 2 * 60 * 1000;
/** Tras estos intentos el evento pasa a FAILED y queda visible en la tabla. */
export const MAX_WHATSAPP_EVENT_ATTEMPTS = 8;

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

/** Meta manda `timestamp` en segundos Unix (como texto); si no se puede leer, `null`. */
function parseMetaTimestamp(value: unknown): Date | null {
  const raw = asString(value);
  if (!raw || !/^\d{9,13}$/.test(raw)) return null;
  const seconds = raw.length > 10 ? Number(raw) / 1000 : Number(raw);
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface WhatsAppInboundMessage {
  externalId: string | null;
  phone: string;
  contactName: string | null;
  body: string | null;
  mediaType: string | null;
  sentAt: Date | null;
}

export interface WhatsAppMessageStatusUpdate {
  externalId: string;
  status: ConversationMessageStatus | null;
  rawStatus: string | null;
}

export interface WhatsAppExtractedEvents {
  messages: WhatsAppInboundMessage[];
  statuses: WhatsAppMessageStatusUpdate[];
  /** Ítems que no se pudieron leer (sin teléfono, sin id de estado…). */
  skipped: string[];
}

const STATUS_BY_META: Record<string, ConversationMessageStatus> = {
  sent: ConversationMessageStatus.SENT,
  delivered: ConversationMessageStatus.DELIVERED,
  read: ConversationMessageStatus.READ,
  failed: ConversationMessageStatus.FAILED,
};

function getMessageBody(message: JsonRecord): string | null {
  const text = isRecord(message.text) ? asString(message.text.body) : null;
  if (text) return text;
  const button = isRecord(message.button) ? asString(message.button.text) : null;
  if (button) return button;
  const interactive = isRecord(message.interactive) ? message.interactive : null;
  const reply = interactive && isRecord(interactive.button_reply) ? interactive.button_reply : null;
  const listReply = interactive && isRecord(interactive.list_reply) ? interactive.list_reply : null;
  return (reply && asString(reply.title)) ?? (listReply && asString(listReply.title)) ?? null;
}

/**
 * Recorre TODO el cuerpo (varias `entry`, varios `changes`): un solo POST de
 * Meta puede traer varios mensajes y estados. Puro y sin excepciones.
 */
export function extractWhatsAppEvents(payload: unknown): WhatsAppExtractedEvents {
  const result: WhatsAppExtractedEvents = { messages: [], statuses: [], skipped: [] };
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return result;

  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const value = isRecord(change) && isRecord(change.value) ? change.value : null;
      if (!value) continue;

      const names = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          if (!isRecord(contact)) continue;
          const waId = asString(contact.wa_id);
          const name = isRecord(contact.profile) ? asString(contact.profile.name) : null;
          if (waId && name) names.set(normalizePhone(waId), name);
        }
      }

      if (Array.isArray(value.messages)) {
        for (const message of value.messages) {
          if (!isRecord(message)) {
            result.skipped.push("message:not-an-object");
            continue;
          }
          const phone = normalizePhone(asString(message.from));
          if (!phone) {
            result.skipped.push(`message:${asString(message.id) ?? "?"}:no-phone`);
            continue;
          }
          const type = asString(message.type);
          result.messages.push({
            externalId: asString(message.id),
            phone,
            contactName: names.get(phone) ?? null,
            body: getMessageBody(message),
            mediaType: type && type !== "text" ? type : null,
            sentAt: parseMetaTimestamp(message.timestamp),
          });
        }
      }

      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          const externalId = isRecord(status) ? asString(status.id) : null;
          if (!externalId) {
            result.skipped.push("status:no-id");
            continue;
          }
          const rawStatus = isRecord(status) ? asString(status.status)?.toLowerCase() ?? null : null;
          result.statuses.push({
            externalId,
            rawStatus,
            status: rawStatus ? (STATUS_BY_META[rawStatus] ?? null) : null,
          });
        }
      }
    }
  }

  return result;
}

function dueFilter(now: Date) {
  return { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] };
}

function getSafeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido";
  return message.slice(0, 1_000);
}

async function resolveStoreId(connectionStoreId: string | null | undefined) {
  if (connectionStoreId) return connectionStoreId;
  // Evento anterior a la conexión de WhatsApp: hay una sola tienda.
  const store = await prismadb.store.findFirst({ select: { id: true } });
  if (!store) throw new Error("No hay una tienda a la que asignar la conversación");
  return store.id;
}

async function fileInboundMessage(storeId: string, message: WhatsAppInboundMessage, eventId: string) {
  const conversation = await prismadb.conversation.upsert({
    where: { storeId_channel_phone: { storeId, channel: ConversationChannel.WHATSAPP, phone: message.phone } },
    create: {
      storeId,
      channel: ConversationChannel.WHATSAPP,
      phone: message.phone,
      contactName: message.contactName,
      status: ConversationStatus.OPEN,
      lastInboundAt: message.sentAt ?? new Date(),
    },
    update: {
      ...(message.contactName ? { contactName: message.contactName } : {}),
      lastInboundAt: message.sentAt ?? new Date(),
    },
    select: { id: true },
  });
  // Una conversación cerrada vuelve a abrirse con el siguiente mensaje; una
  // que espera a la dueña sigue esperándola.
  await prismadb.conversation.updateMany({
    where: { id: conversation.id, status: ConversationStatus.RESOLVED },
    data: { status: ConversationStatus.OPEN },
  });

  const data = {
    conversationId: conversation.id,
    direction: ConversationMessageDirection.INBOUND,
    sentBy: ConversationMessageSentBy.CUSTOMER,
    body: message.body,
    mediaType: message.mediaType,
    status: ConversationMessageStatus.RECEIVED,
    rawEventId: eventId,
    ...(message.sentAt ? { createdAt: message.sentAt } : {}),
  };
  if (message.externalId) {
    await prismadb.conversationMessage.upsert({
      where: { externalId: message.externalId },
      update: {},
      create: { ...data, externalId: message.externalId },
    });
  } else {
    await prismadb.conversationMessage.create({ data });
  }
}

export async function processWhatsAppWebhookEvent(eventId: string) {
  const event = await prismadb.marketplaceWebhookEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      provider: true,
      status: true,
      attempts: true,
      nextRetryAt: true,
      payload: true,
      connection: { select: { storeId: true } },
    },
  });

  if (!event) return { processed: false, reason: "not_found" as const };
  if (event.provider !== MarketplaceProvider.WHATSAPP) {
    return { processed: false, reason: "wrong_provider" as const };
  }
  if (event.status === MarketplaceWebhookEventStatus.PROCESSED) {
    return { processed: false, reason: "already_processed" as const };
  }
  if (event.status === MarketplaceWebhookEventStatus.FAILED) {
    return { processed: false, reason: "failed" as const };
  }
  const now = new Date();
  if (event.nextRetryAt && event.nextRetryAt > now) {
    return { processed: false, reason: "not_due" as const };
  }

  const claim = await prismadb.marketplaceWebhookEvent.updateMany({
    where: {
      id: event.id,
      status: { in: [MarketplaceWebhookEventStatus.PENDING, MarketplaceWebhookEventStatus.RETRY] },
      ...dueFilter(now),
    },
    data: {
      status: MarketplaceWebhookEventStatus.PROCESSING,
      attempts: { increment: 1 },
      nextRetryAt: null,
    },
  });
  if (claim.count === 0) {
    return { processed: false, reason: "claimed_elsewhere" as const };
  }

  const attempts = event.attempts + 1;
  const extracted = extractWhatsAppEvents(event.payload);

  try {
    const storeId = await resolveStoreId(event.connection?.storeId);
    let statusesApplied = 0;

    for (const message of extracted.messages) {
      await fileInboundMessage(storeId, message, event.id);
    }
    for (const status of extracted.statuses) {
      if (!status.status) {
        extracted.skipped.push(`status:${status.externalId}:${status.rawStatus ?? "?"}`);
        continue;
      }
      // Un estado puede llegar antes de que exista el mensaje saliente al que
      // apunta (el envío todavía no existe): se salta sin fallar ni inventar filas.
      const updated = await prismadb.conversationMessage.updateMany({
        where: { externalId: status.externalId },
        data: { status: status.status },
      });
      statusesApplied += updated.count;
    }

    if (extracted.skipped.length > 0) {
      console.warn("[WHATSAPP_SYNC] Ítems del evento sin reconocer", {
        eventId: event.id,
        skipped: extracted.skipped.slice(0, 20),
      });
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
    return {
      processed: true,
      reason: "processed" as const,
      messages: extracted.messages.length,
      statuses: statusesApplied,
      skipped: extracted.skipped.length,
    };
  } catch (error) {
    const lastError = getSafeErrorMessage(error);
    if (attempts >= MAX_WHATSAPP_EVENT_ATTEMPTS) {
      await prismadb.marketplaceWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: MarketplaceWebhookEventStatus.FAILED,
          nextRetryAt: null,
          lastError: `Se agotaron los ${MAX_WHATSAPP_EVENT_ATTEMPTS} intentos. Último error: ${lastError}`,
        },
      });
      console.error("[WHATSAPP_SYNC] Evento fallido de forma permanente", { eventId: event.id, lastError });
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
    console.warn("[WHATSAPP_SYNC] Evento programado para reintento", { eventId: event.id, attempts, lastError });
    return { processed: false, reason: "retry_scheduled" as const };
  }
}
