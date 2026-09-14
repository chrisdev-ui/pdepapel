import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import {
  formatBotReply,
  matchWhatsAppKeyword,
  normalizeBotText,
  type WhatsAppBotKeyword,
} from "@/lib/whatsapp/bot-matching";
import {
  TALK_TO_OWNER_BUTTON_ID,
  TALK_TO_OWNER_BUTTON_TITLE,
  buildButtonId,
  getActiveBotKeywords,
  getSendableBotReply,
  readButtonTarget,
} from "@/lib/whatsapp/bot-replies";
import {
  sendWhatsAppButtonMessage,
  sendWhatsAppTypingIndicator,
  type WhatsAppReplyButton,
} from "@/lib/whatsapp/send";

export { formatBotReply, matchWhatsAppKeyword, normalizeBotText };

/**
 * Bot de WhatsApp por palabra clave.
 *
 * Las reglas son de Paula:
 * - solo palabra clave, nada de respuestas abiertas;
 * - la respuesta sale tal como ella la escribió, sin encabezado de robot
 *   (decisión suya, 2026-09-14): en el panel sigue marcada como del bot;
 * - TODO mensaje del bot lleva el botón «Hablar con Paula», siempre, puesto
 *   por el sistema y no por quien escribe la respuesta;
 * - un menú (una respuesta con botones) no sale hasta que Paula lo apruebe;
 * - sin horario: está siempre activo.
 *
 * La regla de «nunca dos automáticas seguidas» se quitó el 2026-09-14: si la
 * clienta quiere seguir con el bot puede, porque siempre tiene a la vista el
 * botón para salirse a hablar con Paula.
 *
 * Qué pasa con `NEEDS_OWNER`:
 * - un mensaje ESCRITO no despierta al bot; la conversación ya es de una
 *   persona y meterse sería pisarla;
 * - tocar un BOTÓN sí, porque es la clienta eligiendo al bot a propósito.
 *   Lo único que no la saca de ahí es el botón de Paula.
 *
 * `NEEDS_OWNER` solo se limpia cuando llega un eco del teléfono de Paula
 * (`lib/whatsapp/conversation-sync.ts`), porque ella contesta desde su celular
 * y no desde el panel.
 */

export type WhatsAppBotOutcome =
  /** La conversación ya esperaba a una persona: el bot no hace nada. */
  | "skipped_needs_owner"
  /** Ninguna palabra clave coincidió. */
  | "escalated_no_match"
  /** Tocó «Hablar con Paula»: se avisa y el bot se calla. */
  | "escalated_owner_requested"
  /** El botón apunta a una respuesta borrada, apagada o sin aprobar. */
  | "escalated_button_unavailable"
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
 * Ritmo humano.
 *
 * Paula lo pidió así: que no parezca una máquina. Antes de contestar se manda
 * el indicador de «escribiendo…» (que además marca el mensaje como leído) y se
 * espera un momento, como si alguien leyera y escribiera.
 *
 * La espera crece con el largo de la respuesta, porque escribir tres frases
 * toma más que escribir una. El tope está muy por debajo de los 25 segundos
 * que Meta mantiene el indicador, para que nunca se apague antes de tiempo.
 */
export const HUMAN_PAUSE_READ_MS = 1000;
export const HUMAN_PAUSE_PER_CHAR_MS = 25;
export const HUMAN_PAUSE_MAX_MS = 7000;

export function getHumanPauseMs(answer: string): number {
  return Math.min(
    HUMAN_PAUSE_READ_MS + answer.length * HUMAN_PAUSE_PER_CHAR_MS,
    HUMAN_PAUSE_MAX_MS,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lo que se contesta al tocar «Hablar con Paula». */
export const TALK_TO_OWNER_ACKNOWLEDGEMENT =
  "Listo, le aviso a Paula. Ella te escribe apenas pueda 💛";

/**
 * Botones de un mensaje del bot. El de «Hablar con Paula» se añade siempre y
 * va de último: es la salida, no una opción más del menú.
 */
export function buildReplyButtons(
  buttons: { title: string; targetReplyId: string }[] | undefined,
): WhatsAppReplyButton[] {
  const menu = (buttons ?? []).map((button) => ({
    id: buildButtonId(button.targetReplyId),
    title: button.title,
  }));
  return [...menu, { id: TALK_TO_OWNER_BUTTON_ID, title: TALK_TO_OWNER_BUTTON_TITLE }];
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
  /** Id del botón tocado, si el mensaje fue un toque y no texto escrito. */
  interactiveReplyId?: string | null;
  /** `wamid` del mensaje entrante: hace falta para «escribiendo…». */
  inboundMessageId?: string | null;
  /**
   * Solo para pruebas: salta la ESPERA para no dormir el test. El indicador
   * de «escribiendo…» se manda igual, porque es parte de lo que hay que
   * comprobar y no cuesta tiempo.
   */
  skipHumanPause?: boolean;
  /** Solo para pruebas: si no se pasa, se leen las respuestas de la tienda. */
  keywords?: WhatsAppBotKeyword[];
}): Promise<WhatsAppBotResult> {
  const conversation = await prismadb.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, status: true, storeId: true },
  });
  if (!conversation) return { outcome: "skipped_needs_owner" };

  const buttonId = input.interactiveReplyId?.trim() || null;

  // 1. Pidió a Paula: se le confirma y el bot se calla. Es la única salida que
  //    no se puede deshacer tocando otro botón.
  if (buttonId === TALK_TO_OWNER_BUTTON_ID) {
    const sent = await deliver(conversation.id, input.phone, TALK_TO_OWNER_ACKNOWLEDGEMENT, [], pacing(input));
    await escalate(conversation.id);
    return sent.ok
      ? { outcome: "escalated_owner_requested" }
      : { outcome: "escalated_owner_requested", error: sent.error };
  }

  const buttonTarget = readButtonTarget(buttonId);

  // 2. Detenido: la conversación ya espera a una persona. Un mensaje escrito
  //    no la despierta; tocar un botón sí, porque es la clienta eligiendo.
  if (conversation.status === ConversationStatus.NEEDS_OWNER && !buttonTarget) {
    return { outcome: "skipped_needs_owner" };
  }

  // 3. Por botón se sirve la respuesta exacta a la que apunta, sin pasar por
  //    los disparadores. Si ya no se puede mandar (borrada, apagada o sin la
  //    aprobación de Paula) la conversación pasa a ella en vez de callar.
  if (buttonTarget) {
    const target =
      input.keywords?.find((keyword) => keyword.id === buttonTarget) ??
      (input.keywords ? null : await getSendableBotReply(conversation.storeId, buttonTarget));
    if (!target) {
      await escalate(conversation.id);
      return { outcome: "escalated_button_unavailable" };
    }
    return respond(conversation.id, input.phone, target, undefined, pacing(input));
  }

  // 4. Solo palabra clave: sin coincidencia no se inventa una respuesta. Las
  //    respuestas las escribe la dueña desde el panel; si no ha creado
  //    ninguna, el bot calla y la conversación queda para ella.
  const keywords = input.keywords ?? (await getActiveBotKeywords(conversation.storeId));
  const match = matchWhatsAppKeyword(input.body, keywords);
  if (!match) {
    await escalate(conversation.id);
    return { outcome: "escalated_no_match" };
  }

  return respond(conversation.id, input.phone, match.keyword, match.trigger, pacing(input));
}

interface Pacing {
  inboundMessageId: string | null;
  skip: boolean;
}

function pacing(input: {
  inboundMessageId?: string | null;
  skipHumanPause?: boolean;
}): Pacing {
  return {
    inboundMessageId: input.inboundMessageId?.trim() || null,
    skip: Boolean(input.skipHumanPause),
  };
}

/** Manda la respuesta y la deja archivada; escala si el envío falla. */
async function respond(
  conversationId: string,
  phone: string,
  keyword: WhatsAppBotKeyword,
  trigger: string | undefined,
  pace: Pacing,
): Promise<WhatsAppBotResult> {
  const sent = await deliver(conversationId, phone, keyword.answer, keyword.buttons ?? [], pace);
  if (!sent.ok) {
    await escalate(conversationId);
    return { outcome: "escalated_send_failed", trigger, error: sent.error };
  }
  return trigger ? { outcome: "replied", trigger } : { outcome: "replied" };
}

/**
 * Envía y archiva. Siempre con botones: aunque la respuesta no tenga menú,
 * va el de «Hablar con Paula», que es la promesa que se le hizo a la clienta.
 */
async function deliver(
  conversationId: string,
  phone: string,
  answer: string,
  buttons: { title: string; targetReplyId: string }[],
  pace: Pacing,
): Promise<{ ok: boolean; error?: string }> {
  const reply = formatBotReply(answer);

  // «Escribiendo…» primero y después la espera. Si el indicador falla no se
  // interrumpe nada: es adorno, la respuesta es lo que importa.
  if (pace.inboundMessageId) {
    const typing = await sendWhatsAppTypingIndicator(pace.inboundMessageId);
    if (!typing.ok) {
      console.warn("[WHATSAPP_BOT] No se pudo mostrar «escribiendo…»", {
        error: typing.error,
      });
    }
  }
  if (!pace.skip) await sleep(getHumanPauseMs(reply));

  const sent = await sendWhatsAppButtonMessage(phone, reply, buildReplyButtons(buttons));

  if (!sent.ok) {
    // Queda el intento escrito para que se vea qué se quiso mandar. No se
    // reintenta nunca: un reintento a ciegas le llega dos veces a la clienta.
    await prismadb.conversationMessage.create({
      data: {
        conversationId,
        direction: ConversationMessageDirection.OUTBOUND,
        sentBy: ConversationMessageSentBy.BOT,
        body: reply,
        status: ConversationMessageStatus.FAILED,
      },
    });
    return { ok: false, error: sent.error };
  }

  const now = new Date();
  await prismadb.conversationMessage.create({
    data: {
      conversationId,
      direction: ConversationMessageDirection.OUTBOUND,
      sentBy: ConversationMessageSentBy.BOT,
      externalId: sent.externalId,
      body: reply,
      status: ConversationMessageStatus.SENT,
      createdAt: now,
    },
  });
  await prismadb.conversation.update({
    where: { id: conversationId },
    data: { lastOutboundAt: now },
  });
  return { ok: true };
}
