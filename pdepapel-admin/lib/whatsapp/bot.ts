import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import {
  WHATSAPP_BOT_KEYWORDS,
  type WhatsAppBotKeyword,
} from "@/lib/whatsapp/bot-keywords";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send";

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

/** Marca visible que encabeza toda respuesta automática. */
export const WHATSAPP_BOT_MARKER = "🤖 Respuesta automática";

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

/**
 * Minúsculas y sin tildes, con el mismo patrón que usa `lib/slugify.ts`, para
 * que «¿A QUÉ HORA?» y «a que hora» comparen igual.
 */
export function normalizeBotText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Primera entrada cuyo trigger aparezca en el mensaje; `null` si ninguna. */
export function matchWhatsAppKeyword(
  body: string,
  keywords: WhatsAppBotKeyword[] = WHATSAPP_BOT_KEYWORDS,
): { keyword: WhatsAppBotKeyword; trigger: string } | null {
  const normalized = normalizeBotText(body);
  if (!normalized) return null;

  for (const keyword of keywords) {
    for (const trigger of keyword.triggers) {
      const needle = normalizeBotText(trigger);
      if (needle && normalized.includes(needle)) return { keyword, trigger: needle };
    }
  }
  return null;
}

/** Encabeza la respuesta con la marca, para que nunca se lea como una persona. */
export function formatBotReply(answer: string): string {
  return `${WHATSAPP_BOT_MARKER}\n\n${answer}`;
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
  keywords?: WhatsAppBotKeyword[];
}): Promise<WhatsAppBotResult> {
  const conversation = await prismadb.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, status: true },
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

  // 3. Solo palabra clave: sin coincidencia no se inventa una respuesta.
  const match = matchWhatsAppKeyword(input.body, input.keywords);
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
