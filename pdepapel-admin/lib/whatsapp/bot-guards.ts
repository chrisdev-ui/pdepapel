import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  MarketplaceProvider,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";

/**
 * Frenos del bot que se miran justo antes de cada envío (incidente del
 * 2026-10-10: respuestas viejas y repetidas que le llegaban a la clienta
 * después de que ella ya había escrito otra cosa o pedido a Paula).
 */

/** Como mucho tantos mensajes del bot por cada mensaje de la clienta. */
export const BOT_MAX_MESSAGES_PER_INBOUND = 2;
/** Y como mucho tantos por conversación en esta ventana. */
export const BOT_MAX_MESSAGES_PER_WINDOW = 4;
export const BOT_MESSAGE_WINDOW_MS = 10 * 60 * 1000;
/** El menú de bienvenida sale una vez por conversación en este lapso. */
export const WELCOME_REPEAT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Eventos sin procesar que se revisan; lo normal son cero a tres. */
const PENDING_EVENTS_SCAN = 25;

/**
 * El interruptor «Bot de WhatsApp activo» de Configuración, leído de la base
 * en cada llamada (sin memoria). Sin fila, apagado: es lo mismo que enseña la
 * pantalla.
 */
export async function isBotEnabled(storeId: string): Promise<boolean> {
  const settings = await prismadb.storeSettings.findUnique({
    where: { storeId },
    select: { botEnabled: true },
  });
  return settings?.botEnabled ?? false;
}

export interface PendingActivityQuery {
  /** El evento que se está procesando; los posteriores son los que importan. */
  eventId: string;
  eventCreatedAt: Date;
  phone: string | null;
  bsuid: string | null;
}

/**
 * ¿Hay algo de esta clienta que ya llegó al webhook pero todavía espera en la
 * fila? Cada clienta tiene una fila de QStash con un solo trabajo a la vez,
 * así que su mensaje siguiente —o el de Paula— no está en `ConversationMessage`
 * hasta que este trabajo termine: hay que mirarlo en los eventos guardados.
 * Compara horas del servidor en los dos lados, no la del teléfono.
 */
export async function findPendingCustomerActivity(
  query: PendingActivityQuery,
): Promise<"customer_message" | "owner_message" | null> {
  if (!query.phone && !query.bsuid) return null;
  const pending = await prismadb.marketplaceWebhookEvent.findMany({
    where: {
      provider: MarketplaceProvider.WHATSAPP,
      processedAt: null,
      createdAt: { gt: query.eventCreatedAt },
      id: { not: query.eventId },
    },
    orderBy: { createdAt: "asc" },
    take: PENDING_EVENTS_SCAN,
    select: { payload: true },
  });
  if (pending.length === 0) return null;

  const { extractWhatsAppEvents } = await import("@/lib/whatsapp/conversation-sync");
  const isThisCustomer = (identity: { phone: string | null; bsuid: string | null }) =>
    (query.phone !== null && identity.phone === query.phone) ||
    (query.bsuid !== null && identity.bsuid === query.bsuid);

  for (const event of pending) {
    const extracted = extractWhatsAppEvents(event.payload as never);
    if (extracted.ownerEchoes.some(isThisCustomer)) return "owner_message";
    if (extracted.messages.some(isThisCustomer)) return "customer_message";
  }
  return null;
}

export type BotCap = "per_inbound" | "per_window";

/** El tope que este envío pasaría, o `null`. Se registra sin contenido. */
export async function exceededBotCap(
  conversationId: string,
  inboundAt: Date | null,
  now = new Date(),
): Promise<BotCap | null> {
  const fromBot = {
    conversationId,
    direction: ConversationMessageDirection.OUTBOUND,
    sentBy: ConversationMessageSentBy.BOT,
  };
  if (inboundAt) {
    const sinceInbound = await prismadb.conversationMessage.count({
      where: { ...fromBot, createdAt: { gte: inboundAt } },
    });
    if (sinceInbound >= BOT_MAX_MESSAGES_PER_INBOUND) return "per_inbound";
  }
  const inWindow = await prismadb.conversationMessage.count({
    where: { ...fromBot, createdAt: { gte: new Date(now.getTime() - BOT_MESSAGE_WINDOW_MS) } },
  });
  return inWindow >= BOT_MAX_MESSAGES_PER_WINDOW ? "per_window" : null;
}

/**
 * ¿Ya salió el menú de bienvenida en las últimas 24 h? Desde este cambio se
 * marca con `metadata.kind = "welcome"`; los de antes se reconocen por cómo
 * empiezan.
 */
export async function welcomeSentRecently(
  conversationId: string,
  welcomeBody: string,
  now = new Date(),
): Promise<boolean> {
  const recent = await prismadb.conversationMessage.findMany({
    where: {
      conversationId,
      sentBy: ConversationMessageSentBy.BOT,
      createdAt: { gte: new Date(now.getTime() - WELCOME_REPEAT_WINDOW_MS) },
    },
    select: { body: true, metadata: true },
  });
  const opening = welcomeBody.trim().slice(0, 40);
  return recent.some(
    (message) =>
      (message.metadata as { kind?: unknown } | null)?.kind === "welcome" ||
      Boolean(opening && message.body?.trim().startsWith(opening)),
  );
}
