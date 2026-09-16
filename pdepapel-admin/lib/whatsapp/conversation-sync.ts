import {
  type Prisma,
  ConversationChannel,
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
  MarketplaceProvider,
  MarketplaceWebhookEventStatus,
} from "@prisma/client";

import { claimQueueRow } from "@/lib/atomic-claim";
import { normalizePhone } from "@/lib/customer-views";
import prismadb from "@/lib/prismadb";
import { runWhatsAppBot, type WhatsAppBotResult } from "@/lib/whatsapp/bot";

/**
 * Convierte un `MarketplaceWebhookEvent` de WhatsApp en historial: una
 * `Conversation` por teléfono y un `ConversationMessage` por mensaje entrante;
 * los estados de entrega (`statuses`) actualizan el mensaje al que apuntan.
 *
 * También archiva los ecos (`smb_message_echoes`): lo que Paula contesta desde
 * la app de WhatsApp Business en su celular llega por el mismo webhook, con el
 * teléfono de la clienta en `to` y no en `from`. Ese eco es la única señal de
 * que una persona ya respondió, y lo único que saca a una conversación de
 * `NEEDS_OWNER`.
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
  /**
   * Id del botón que tocó la clienta, tal como se lo mandamos nosotros.
   * Es más fiable que el texto: Paula puede renombrar un botón sin romper
   * el menú. `null` en un mensaje escrito a mano.
   */
  interactiveReplyId: string | null;
  /** Extras estructurados; hoy solo el carrito de un mensaje `order`. */
  metadata: WhatsAppMessageMetadata | null;
}

/** Un renglón del carrito tal como lo manda Meta, sin resolver todavía. */
export interface WhatsAppCartItem {
  /** `product_retailer_id`: es el SKU con el que se publicó el producto en el feed. */
  sku: string;
  quantity: number;
  unitPrice: number | null;
  currency: string | null;
}

export interface WhatsAppMessageMetadata {
  order?: {
    catalogId: string | null;
    /** Nota que la clienta escribe junto al carrito, si la hay. */
    note: string | null;
    items: WhatsAppCartItem[];
  };
}

/** Mensaje que Paula mandó desde su celular y volvió como eco. */
export interface WhatsAppOwnerEcho {
  externalId: string | null;
  /** Teléfono de la clienta: en un eco viene en `to`, no en `from`. */
  phone: string;
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
  ownerEchoes: WhatsAppOwnerEcho[];
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

const MEDIA_WITH_CAPTION = [
  "image",
  "video",
  "document",
  "audio",
  "sticker",
] as const;

/**
 * Adjuntos que van derechos a Paula, lleven pie de foto o no.
 *
 * Lo que va dentro de una foto o de un audio —una lista de útiles del colegio,
 * la marca exacta que le pidieron, «¿tienes esto?» dicho en voz— el bot no lo
 * puede leer. Y adivinar por las dos palabras que vengan sueltas al lado sale
 * mal: el 2026-09-15 una clienta mandó la foto de una lista del colegio y se
 * le contestó con ocho productos al azar sacados de la palabra «útiles».
 *
 * Así que ni se intenta. Se acusa recibo y lo mira Paula, que sí puede verlo.
 *
 * Fuera quedan los stickers y las reacciones a propósito: son un gesto, no una
 * pregunta, y contestarles «se lo paso a Paula» sería ruido.
 */
const MEDIA_FOR_OWNER = ["image", "video", "document", "audio"];

export function isMediaForOwner(mediaType: string | null): boolean {
  return Boolean(mediaType && MEDIA_FOR_OWNER.includes(mediaType));
}

function getMessageBody(message: JsonRecord): string | null {
  const text = isRecord(message.text) ? asString(message.text.body) : null;
  if (text) return text;
  const button = isRecord(message.button)
    ? asString(message.button.text)
    : null;
  if (button) return button;
  const interactive = isRecord(message.interactive)
    ? message.interactive
    : null;
  const reply =
    interactive && isRecord(interactive.button_reply)
      ? interactive.button_reply
      : null;
  const listReply =
    interactive && isRecord(interactive.list_reply)
      ? interactive.list_reply
      : null;
  const tocado =
    (reply && asString(reply.title)) ??
    (listReply && asString(listReply.title)) ??
    null;
  if (tocado) return tocado;

  // El pie de una foto es texto escrito por la clienta, no adorno: quien manda
  // una imagen con «¿tienen este cuaderno?» preguntó igual que si lo hubiera
  // escrito suelto. Esto lo hacía solo el camino de los ecos de Paula, así que
  // a las clientas se les caía la pregunta y el mensaje llegaba sin cuerpo.
  return getMediaCaption(message);
}

/** El pie de cualquiera de los adjuntos que lo admiten. */
function getMediaCaption(message: JsonRecord): string | null {
  for (const key of MEDIA_WITH_CAPTION) {
    const media = isRecord(message[key]) ? message[key] : null;
    const caption = media ? asString(media.caption) : null;
    if (caption) return caption;
  }
  return null;
}

/**
 * Id del botón tocado. Meta lo devuelve en `button_reply.id` o `list_reply.id`
 * exactamente como lo enviamos, así que sirve de llave estable.
 */
function getInteractiveReplyId(message: JsonRecord): string | null {
  const interactive = isRecord(message.interactive)
    ? message.interactive
    : null;
  if (!interactive) return null;
  const reply = isRecord(interactive.button_reply)
    ? interactive.button_reply
    : null;
  const listReply = isRecord(interactive.list_reply)
    ? interactive.list_reply
    : null;
  return (
    (reply && asString(reply.id)) ??
    (listReply && asString(listReply.id)) ??
    null
  );
}

/**
 * Cuerpo de un eco. Además del texto, rescata el pie de una imagen y el texto
 * nuevo de una edición; de un `revoke` no hay nada que rescatar. Lo que no se
 * entienda queda como `null` y el tipo viaja en `mediaType`.
 */
function getEchoBody(echo: JsonRecord): string | null {
  // `getMessageBody` ya rescata el pie de los adjuntos, para ecos y para lo
  // que mandan las clientas por igual.
  const direct = getMessageBody(echo);
  if (direct) return direct;

  const edit = isRecord(echo.edit) ? echo.edit : null;
  const edited = edit && isRecord(edit.message) ? edit.message : null;
  return edited ? getMessageBody(edited) : null;
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value);
  return null;
};

/**
 * Carrito de un mensaje `type: "order"`. Se guarda crudo: el SKU
 * (`product_retailer_id`) se resuelve contra el catálogo al mostrarlo, no aquí,
 * para que el precio y las existencias sean los de ese momento. Un carrito sin
 * renglones legibles devuelve `null` en vez de una lista vacía.
 */
function getCartMetadata(message: JsonRecord): WhatsAppMessageMetadata | null {
  const order = isRecord(message.order) ? message.order : null;
  if (!order) return null;

  const items: WhatsAppCartItem[] = [];
  for (const raw of Array.isArray(order.product_items)
    ? order.product_items
    : []) {
    if (!isRecord(raw)) continue;
    const sku = asString(raw.product_retailer_id);
    if (!sku) continue;
    items.push({
      sku,
      quantity: Math.max(1, asNumber(raw.quantity) ?? 1),
      unitPrice: asNumber(raw.item_price),
      currency: asString(raw.currency),
    });
  }
  if (items.length === 0) return null;

  return {
    order: {
      catalogId: asString(order.catalog_id),
      note: asString(order.text),
      items,
    },
  };
}

/**
 * Recorre TODO el cuerpo (varias `entry`, varios `changes`): un solo POST de
 * Meta puede traer varios mensajes, ecos y estados. Puro y sin excepciones.
 */
export function extractWhatsAppEvents(
  payload: unknown,
): WhatsAppExtractedEvents {
  const result: WhatsAppExtractedEvents = {
    messages: [],
    ownerEchoes: [],
    statuses: [],
    skipped: [],
  };
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return result;

  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const value =
        isRecord(change) && isRecord(change.value) ? change.value : null;
      if (!value) continue;

      const names = new Map<string, string>();
      if (Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          if (!isRecord(contact)) continue;
          const waId = asString(contact.wa_id);
          const name = isRecord(contact.profile)
            ? asString(contact.profile.name)
            : null;
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
            result.skipped.push(
              `message:${asString(message.id) ?? "?"}:no-phone`,
            );
            continue;
          }
          const type = asString(message.type);
          const metadata = getCartMetadata(message);
          result.messages.push({
            externalId: asString(message.id),
            phone,
            contactName: names.get(phone) ?? null,
            // Un carrito trae su nota en `order.text`; si no hay, queda sin cuerpo.
            body: getMessageBody(message) ?? metadata?.order?.note ?? null,
            mediaType: type && type !== "text" ? type : null,
            sentAt: parseMetaTimestamp(message.timestamp),
            interactiveReplyId: getInteractiveReplyId(message),
            metadata,
          });
        }
      }

      // Ecos del celular de Paula. No todos los dispositivos acompañantes los
      // generan, así que esto es «lo mejor que se pueda»: si no llega, la
      // conversación simplemente sigue esperándola.
      if (Array.isArray(value.message_echoes)) {
        for (const echo of value.message_echoes) {
          if (!isRecord(echo)) {
            result.skipped.push("echo:not-an-object");
            continue;
          }
          // El teléfono de la clienta es `to`: en un eco los papeles se invierten.
          const phone = normalizePhone(asString(echo.to));
          if (!phone) {
            result.skipped.push(`echo:${asString(echo.id) ?? "?"}:no-phone`);
            continue;
          }
          const type = asString(echo.type);
          result.ownerEchoes.push({
            externalId: asString(echo.id),
            phone,
            body: getEchoBody(echo),
            mediaType: type && type !== "text" ? type : null,
            sentAt: parseMetaTimestamp(echo.timestamp),
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
          const rawStatus = isRecord(status)
            ? (asString(status.status)?.toLowerCase() ?? null)
            : null;
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
  if (!store)
    throw new Error("No hay una tienda a la que asignar la conversación");
  return store.id;
}

/**
 * Qué pasó al archivar un entrante. Solo `created` habilita al bot: un webhook
 * reenviado (`duplicate`) no puede volver a disparar una respuesta, y un
 * mensaje sin `externalId` (`created_without_id`) no se puede deduplicar, así
 * que tampoco se le contesta.
 */
type FiledInboundOutcome = "created" | "duplicate" | "created_without_id";

async function fileInboundMessage(
  storeId: string,
  message: WhatsAppInboundMessage,
  eventId: string,
): Promise<{ conversationId: string; outcome: FiledInboundOutcome }> {
  const conversation = await prismadb.conversation.upsert({
    where: {
      storeId_channel_phone: {
        storeId,
        channel: ConversationChannel.WHATSAPP,
        phone: message.phone,
      },
    },
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
    ...(message.metadata
      ? { metadata: message.metadata as Prisma.InputJsonValue }
      : {}),
    ...(message.sentAt ? { createdAt: message.sentAt } : {}),
  };
  if (!message.externalId) {
    await prismadb.conversationMessage.create({ data });
    return { conversationId: conversation.id, outcome: "created_without_id" };
  }

  // Se consulta antes de crear en vez de hacer `upsert`, porque quien llama
  // necesita distinguir «lo archivé ahora» de «ya estaba»: de eso depende que
  // el bot conteste o no. La cola de QStash procesa los eventos de un mismo
  // teléfono de a uno, así que no hay dos procesos compitiendo aquí; si aun
  // así coincidieran, el índice único hace fallar el `create` y el evento se
  // reintenta, que es preferible a mandar dos respuestas.
  const existing = await prismadb.conversationMessage.findUnique({
    where: { externalId: message.externalId },
    select: { id: true },
  });
  if (existing)
    return { conversationId: conversation.id, outcome: "duplicate" };

  await prismadb.conversationMessage.create({
    data: { ...data, externalId: message.externalId },
  });
  return { conversationId: conversation.id, outcome: "created" };
}

/**
 * Archiva un mensaje que Paula mandó desde su celular. Además de guardarlo,
 * saca la conversación de `NEEDS_OWNER`: es la única señal de que una persona
 * respondió, y lo único que vuelve a habilitar al bot.
 */
async function fileOwnerEcho(
  storeId: string,
  echo: WhatsAppOwnerEcho,
  eventId: string,
): Promise<boolean> {
  const sentAt = echo.sentAt ?? new Date();
  const conversation = await prismadb.conversation.upsert({
    where: {
      storeId_channel_phone: {
        storeId,
        channel: ConversationChannel.WHATSAPP,
        phone: echo.phone,
      },
    },
    create: {
      storeId,
      channel: ConversationChannel.WHATSAPP,
      phone: echo.phone,
      status: ConversationStatus.OPEN,
      lastOutboundAt: sentAt,
      lastOwnerAt: sentAt,
    },
    // `lastOwnerAt` es lo que aparta al bot 24 h: aquí es donde se sabe que
    // quien escribió fue ella y no él, porque esto es el eco de su celular.
    update: { lastOutboundAt: sentAt, lastOwnerAt: sentAt },
    select: { id: true },
  });

  await prismadb.conversation.updateMany({
    where: { id: conversation.id, status: ConversationStatus.NEEDS_OWNER },
    data: { status: ConversationStatus.OPEN },
  });

  if (!echo.externalId) {
    await prismadb.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: ConversationMessageDirection.OUTBOUND,
        sentBy: ConversationMessageSentBy.OWNER,
        body: echo.body,
        mediaType: echo.mediaType,
        status: ConversationMessageStatus.SENT,
        rawEventId: eventId,
        createdAt: sentAt,
      },
    });
    return true;
  }

  const existing = await prismadb.conversationMessage.findUnique({
    where: { externalId: echo.externalId },
    select: { id: true },
  });
  if (existing) return false;

  await prismadb.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: ConversationMessageDirection.OUTBOUND,
      sentBy: ConversationMessageSentBy.OWNER,
      externalId: echo.externalId,
      body: echo.body,
      mediaType: echo.mediaType,
      status: ConversationMessageStatus.SENT,
      rawEventId: eventId,
      createdAt: sentAt,
    },
  });
  return true;
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

  const claimed = await claimQueueRow({
    table: "MarketplaceWebhookEvent",
    id: event.id,
    from: [
      MarketplaceWebhookEventStatus.PENDING,
      MarketplaceWebhookEventStatus.RETRY,
    ],
    dueColumn: "nextRetryAt",
    dueNullMeansReady: true,
    now,
  });
  if (!claimed) {
    return { processed: false, reason: "claimed_elsewhere" as const };
  }

  const attempts = event.attempts + 1;
  const extracted = extractWhatsAppEvents(event.payload);

  try {
    const storeId = await resolveStoreId(event.connection?.storeId);
    let statusesApplied = 0;
    let echoesFiled = 0;
    const botResults: WhatsAppBotResult[] = [];
    const botCandidates: Array<{
      conversationId: string;
      phone: string;
      body: string;
      interactiveReplyId: string | null;
      inboundMessageId: string | null;
      mediaForOwner?: boolean;
      inboundAt?: Date | null;
    }> = [];

    for (const message of extracted.messages) {
      const filed = await fileInboundMessage(storeId, message, event.id);
      if (filed.outcome !== "created") continue;
      // Una foto o un audio van a Paula lleven pie o no: el pie se guarda para
      // que ella lo lea en el panel, pero no se usa para adivinar una
      // respuesta. Antes esto ni llegaba aquí y la clienta se quedaba mirando
      // el chat sin saber si su foto había llegado.
      const paraPaula = isMediaForOwner(message.mediaType);
      if (!message.body && !paraPaula) continue;
      botCandidates.push({
        conversationId: filed.conversationId,
        phone: message.phone,
        body: message.body ?? "",
        interactiveReplyId: message.interactiveReplyId,
        // Hace falta para mostrar «escribiendo…» y marcar como leído.
        inboundMessageId: message.externalId,
        // Para saber, al decidir, si ya llegó otro mensaje después de este.
        inboundAt: message.sentAt ?? null,
        ...(paraPaula ? { mediaForOwner: true } : {}),
      });
    }

    // Los ecos se archivan antes de que conteste el bot: si en el mismo evento
    // viene una respuesta de Paula, el bot debe verla ya escrita.
    for (const echo of extracted.ownerEchoes) {
      if (await fileOwnerEcho(storeId, echo, event.id)) echoesFiled += 1;
    }

    for (const status of extracted.statuses) {
      if (!status.status) {
        extracted.skipped.push(
          `status:${status.externalId}:${status.rawStatus ?? "?"}`,
        );
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

    // El bot va al final, con el historial ya completo. Nunca hace fallar el
    // archivo: si algo revienta al contestar, el evento ya quedó guardado.
    for (const candidate of botCandidates) {
      try {
        botResults.push(await runWhatsAppBot(candidate));
      } catch (error) {
        console.error("[WHATSAPP_SYNC] El bot falló al responder", {
          eventId: event.id,
          conversationId: candidate.conversationId,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
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
      ownerEchoes: echoesFiled,
      statuses: statusesApplied,
      skipped: extracted.skipped.length,
      botOutcomes: botResults.map((result) => result.outcome),
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
      console.error("[WHATSAPP_SYNC] Evento fallido de forma permanente", {
        eventId: event.id,
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
    console.warn("[WHATSAPP_SYNC] Evento programado para reintento", {
      eventId: event.id,
      attempts,
      lastError,
    });
    return { processed: false, reason: "retry_scheduled" as const };
  }
}
