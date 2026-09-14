import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import {
  WHATSAPP_BOT_MARKER,
  formatBotReply,
  matchWhatsAppKeyword,
  normalizeBotText,
  type WhatsAppBotKeyword,
} from "@/lib/whatsapp/bot-matching";
import { getActiveBotKeywords } from "@/lib/whatsapp/bot-replies";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send";

export { WHATSAPP_BOT_MARKER, formatBotReply, matchWhatsAppKeyword, normalizeBotText };

/**
 * Bot de WhatsApp por palabra clave.
 *
 * Las reglas son de Paula, tal como las dio:
 * - solo palabra clave, nada de respuestas abiertas;
 * - toda respuesta automática se ve como automática;
 * - nunca dos respuestas automáticas seguidas sin una persona en medio;
 * - se detiene del todo cuando la conversación queda en `NEEDS_OWNER`;
 * - sin horario: está siempre activo.
 *
 * `NEEDS_OWNER` solo se limpia cuando llega un eco del teléfono de Paula
 * (`lib/whatsapp/conversation-sync.ts`), porque ella contesta desde su celular
 * y no desde el panel.
 */

export type WhatsAppBotOutcome =
  /** La conversación ya esperaba a una persona: el bot no hace nada. */
  | "skipped_needs_owner"
  /** La última salida fue del bot: le toca a una persona. */
  | "escalated_bot_already_replied"
  /** Ninguna palabra clave coincidió. */
  | "escalated_no_match"
  /** Coincidió y se envió. */
  | "replied"
  /** Coincidió pero el envío falló. */
  | "escalated_send_failed";

export interface WhatsAppBotResult {
  outcome: WhatsAppBotOutcome;
  /** Palabra clave que disparó la respuesta, si hubo. */
  trigger?: string;
  error?: string;
}

async function escalate(conversationId: string) {
  await prismadb.conversation.update({
    where: { id: conversationId },
    data: { status: ConversationStatus.NEEDS_OWNER },
  });
}

/**
 * Decide y, si corresponde, contesta. Se llama SOLO con un mensaje entrante
 * recién creado y con cuerpo: un webhook reenviado no vuelve a pasar por aquí,
 * así la clienta nunca recibe la misma respuesta dos veces.
 */
export async function runWhatsAppBot(input: {
  conversationId: string;
  phone: string;
  body: string;
  /** Solo para pruebas: si no se pasa, se leen las respuestas de la tienda. */
  keywords?: WhatsAppBotKeyword[];
}): Promise<WhatsAppBotResult> {
  const conversation = await prismadb.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, status: true, storeId: true },
  });
  if (!conversation) return { outcome: "skipped_needs_owner" };

  // 1. Detenido: la conversación ya espera a una persona.
  if (conversation.status === ConversationStatus.NEEDS_OWNER) {
    return { outcome: "skipped_needs_owner" };
  }

  // 2. Nunca dos automáticas seguidas: si la última salida fue del bot, es
  //    turno de una persona. Solo un eco de Paula vuelve a habilitarlo.
  const lastOutbound = await prismadb.conversationMessage.findFirst({
    where: {
      conversationId: conversation.id,
      direction: ConversationMessageDirection.OUTBOUND,
    },
    orderBy: { createdAt: "desc" },
    select: { sentBy: true },
  });
  if (lastOutbound?.sentBy === ConversationMessageSentBy.BOT) {
    await escalate(conversation.id);
    return { outcome: "escalated_bot_already_replied" };
  }

  // 3. Solo palabra clave: sin coincidencia no se inventa una respuesta. Las
  //    respuestas las escribe la dueña desde el panel; si no ha creado
  //    ninguna, el bot calla y la conversación queda para ella.
  const keywords = input.keywords ?? (await getActiveBotKeywords(conversation.storeId));
  const match = matchWhatsAppKeyword(input.body, keywords);
  if (!match) {
    await escalate(conversation.id);
    return { outcome: "escalated_no_match" };
  }

  const reply = formatBotReply(match.keyword.answer);
  const sent = await sendWhatsAppTextMessage(input.phone, reply);

  if (!sent.ok) {
    // Queda el intento escrito para que se vea qué se quiso mandar, y la
    // conversación pasa a manos de Paula. No se reintenta nunca.
    await prismadb.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: ConversationMessageDirection.OUTBOUND,
        sentBy: ConversationMessageSentBy.BOT,
        body: reply,
        status: ConversationMessageStatus.FAILED,
      },
    });
    await escalate(conversation.id);
    return { outcome: "escalated_send_failed", trigger: match.trigger, error: sent.error };
  }

  const now = new Date();
  await prismadb.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: ConversationMessageDirection.OUTBOUND,
      sentBy: ConversationMessageSentBy.BOT,
      externalId: sent.externalId,
      body: reply,
      status: ConversationMessageStatus.SENT,
      createdAt: now,
    },
  });
  await prismadb.conversation.update({
    where: { id: conversation.id },
    data: { lastOutboundAt: now },
  });

  return { outcome: "replied", trigger: match.trigger };
}
