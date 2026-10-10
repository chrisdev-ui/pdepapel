import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
  type Prisma,
} from "@prisma/client";

import {
  OWNER_TAKEOVER_WINDOW_HOURS,
  describeBotPause,
} from "@/lib/conversation-bot-pause";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import {
  getStoreSettings,
  type ResolvedStoreSettings,
} from "@/lib/store-settings";
import {
  BUSINESS_FACT_TEMPLATES,
  type BusinessFactIntent,
  areBusinessFactsApproved,
  buildPaymentMenuRows,
  buildWelcomeMenuRows,
  classifyBusinessFact,
  isWelcomeGreeting,
  parsePaymentOption,
  renderBusinessFact,
  renderPaymentOption,
} from "@/lib/whatsapp/bot-facts";
import {
  CASUAL_TEMPLATES,
  CATALOG_BUTTON_TEXT,
  CATALOG_LINK_MODE,
  CATALOG_MESSAGE_BODY,
  SEARCH_BUTTON_TEXT,
  SEARCH_LINK_BODY,
  areCasualRepliesApproved,
  buildCatalogUrl,
  buildSearchUrl,
  isCasualIntent,
} from "@/lib/whatsapp/bot-casual";
import {
  classifyMessageIntent,
  isEmojiOnly,
  toProductClassification,
  type IntentOutcome,
} from "@/lib/whatsapp/bot-intent";
import {
  PRODUCT_TEMPLATES,
  areProductAnswersApproved,
  answerAboutProduct,
  answerProductQuestion,
  buildOwnerRow,
  looksLikeProductQuestion,
  type ProductDecision,
} from "@/lib/whatsapp/bot-products";
import {
  detectProductReference,
  readShownIntentForProduct,
  resolveProductReference,
  type ShownProducts,
} from "@/lib/whatsapp/bot-references";
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
  readPaymentTarget,
  readProductTarget,
  getActiveBotKeywords,
  getSendableBotReply,
  readButtonTarget,
  readFactTarget,
} from "@/lib/whatsapp/bot-replies";
import {
  sendWhatsAppButtonMessage,
  sendWhatsAppCtaUrlMessage,
  sendWhatsAppImageButtonMessage,
  sendWhatsAppListMessage,
  sendWhatsAppTextMessage,
  sendWhatsAppTypingIndicator,
  type WhatsAppListRow,
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
 * Mientras Paula esté encima (2026-09-15): si ella escribió en la conversación
 * hace menos de `OWNER_TAKEOVER_WINDOW_HOURS`, el bot no le manda NADA a la
 * clienta, ni siquiera el aviso de que no sabe; por dentro sí deja el hilo en
 * `NEEDS_OWNER` para que a ella le aparezca pendiente. Sin esto, `fileOwnerEcho`
 * devolvía la conversación a `OPEN` cada vez que ella contestaba desde el
 * celular, y el bot volvía a hablarle encima.
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
  /** Paula anda en la conversación ahora mismo: el bot no se mete. */
  | "skipped_owner_active"
  /** Ninguna palabra clave coincidió. */
  | "escalated_no_match"
  /** Tocó «Hablar con Paula»: se avisa y el bot se calla. */
  | "escalated_owner_requested"
  /** El botón apunta a una respuesta borrada, apagada o sin aprobar. */
  | "escalated_button_unavailable"
  /** Coincidió y se envió. */
  | "replied"
  /** Se contestó un dato del negocio (horario, ciudad, envíos…). */
  | "replied_business_fact"
  /** Se contestó sobre productos (si hay, si queda). */
  | "replied_product"
  /** Buscó y no encontró nada seguro: contestó con cautela y se lo pasó a Paula. */
  | "replied_product_unsure"
  /** Dijo «el primero» y se supo cuál era. */
  | "replied_product_reference"
  /** Señaló una opción de una lista que ya no valía; se le pidió repetirla. */
  | "replied_reference_lost"
  /** Llegó un adjunto sin texto: no hay nada que clasificar, va para Paula. */
  | "escalated_unprocessable_media"
  /** Ya llegó otro mensaje después: contesta ese, no este. */
  | "skipped_superseded"
  /** Un «ok», un emoji o un sticker a mitad de conversación: no pide respuesta. */
  | "skipped_acknowledgement"
  /** Gracias, despedida, «¿eres un robot?» o «¿qué venden?», con el texto aprobado. */
  | "replied_casual"
  /** Queja, problema con un pedido o un pago: pasa a Paula sin improvisar. */
  | "escalated_complaint"
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
 * Lo que se contesta cuando el bot no sabe.
 *
 * Antes no se contestaba nada: la conversación pasaba a NEEDS_OWNER y la
 * clienta se quedaba mirando el chat sin saber si su mensaje llegó. Con cero
 * respuestas configuradas ese era el caso de SIEMPRE.
 */
export const NO_MATCH_ACKNOWLEDGEMENT =
  "Esa no me la sé 💛 Le paso tu mensaje a Paula y ella te escribe apenas pueda.";

/** Para que 20 s de espera no se lean como que el mensaje no llegó. */
export const SLOW_ANSWER_ACKNOWLEDGEMENT = "Dame un segundito que lo busco 💛";

/** «Lo que me enviaste» y no «tu foto»: por aquí pasan audios y documentos. */
export const UNREADABLE_MEDIA_ACKNOWLEDGEMENT =
  "Recibí lo que me enviaste 💛 Se lo paso a Paula y ella te escribe apenas pueda.";

/** Cuando el botón apunta a una respuesta que ya no está disponible. */
export const UNAVAILABLE_OPTION_ACKNOWLEDGEMENT =
  "Esa opción ya no está disponible 💛 Le aviso a Paula para que te ayude.";

/**
 * Botones de un mensaje del bot. El de «Hablar con Paula» se añade **siempre**
 * y va de último: es la salida, no una opción más del menú.
 *
 * `includeOwnerButton: false` es la única forma de no ponerlo, y está
 * reservada a los acuses que cierran una escalada que **ya ocurrió en esta
 * misma llamada**: ahí el mensaje ya dice que Paula va a escribir, y volver a
 * ofrecer el botón invita a tocarlo otra vez. Quien lo toca de nuevo no ve
 * nada —`deliver()` se come el repetido dentro de los 60 s de `justSaid()`— y
 * parece que su mensaje no salió.
 *
 * No es un interruptor de uso general: cualquier otro mensaje del bot lleva el
 * botón sin excepción, y hay pruebas que lo vigilan. Si alguna vez hace falta
 * quitarlo en un caso nuevo, que sea porque ese caso también escala de verdad
 * antes de contestar.
 */
export function buildReplyButtons(
  buttons: { title: string; targetReplyId: string }[] | undefined,
  { includeOwnerButton = true }: { includeOwnerButton?: boolean } = {},
): WhatsAppReplyButton[] {
  const menu = (buttons ?? []).map((button) => ({
    id: buildButtonId(button.targetReplyId),
    title: button.title,
  }));
  if (!includeOwnerButton) return menu;
  return [
    ...menu,
    { id: TALK_TO_OWNER_BUTTON_ID, title: TALK_TO_OWNER_BUTTON_TITLE },
  ];
}

/**
 * Cuánto se aparta el bot después de que Paula escriba. Vive en un módulo
 * neutro porque el panel necesita la misma cuenta para decirle a ella cuánto
 * le queda al silencio, y no puede importar este archivo.
 */
export { OWNER_TAKEOVER_WINDOW_HOURS };

export function isOwnerActive(
  lastOwnerAt: Date | null | undefined,
  now: Date,
): boolean {
  return describeBotPause(lastOwnerAt, now).paused;
}

/** Los ajustes; si la lectura falla el bot sigue por el camino de siempre. */
async function readSettings(
  storeId: string,
): Promise<ResolvedStoreSettings | null> {
  try {
    return await getStoreSettings(storeId);
  } catch (error) {
    console.error("[WHATSAPP_BOT] no se pudieron leer los datos del negocio", {
      storeId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

function buttonIdOf(input: {
  interactiveReplyId?: string | null;
}): string | null {
  return input.interactiveReplyId?.trim() || null;
}

/** Se mira al decidir, no al recibir: la ráfaga llega durante la pausa humana. */
async function hasNewerInbound(
  conversationId: string,
  inboundAt: Date | null | undefined,
): Promise<boolean> {
  if (!inboundAt) return false;
  const masNuevo = await prismadb.conversationMessage.findFirst({
    where: {
      conversationId,
      direction: ConversationMessageDirection.INBOUND,
      sentBy: ConversationMessageSentBy.CUSTOMER,
      createdAt: { gt: inboundAt },
    },
    select: { id: true },
  });
  return masNuevo !== null;
}

/**
 * ¿Sigue teniendo sentido hablar? Se pregunta justo antes de enviar, no al
 * entrar.
 *
 * Dos motivos para callarse:
 * - **Paula entró.** `hasNewerInbound` no puede verlo: filtra por entrantes de
 *   la clienta (`INBOUND`/`CUSTOMER`) y el eco de ella es `OUTBOUND`/`OWNER`.
 *   Lo que sí lo delata es `lastOwnerAt`, que es justo lo que pone el eco.
 * - **La clienta siguió escribiendo.** Ya se miraba al entrar; mirarlo otra
 *   vez aquí cubre la ráfaga que llega DURANTE la pausa.
 */
async function shouldStayQuiet(
  conversationId: string,
  pace: Pacing,
): Promise<"owner_active" | "superseded" | null> {
  const actual = await prismadb.conversation.findUnique({
    where: { id: conversationId },
    select: { lastOwnerAt: true },
  });
  if (isOwnerActive(actual?.lastOwnerAt, new Date())) return "owner_active";
  if (
    pace.supersedable &&
    (await hasNewerInbound(conversationId, pace.inboundAt))
  ) {
    return "superseded";
  }
  return null;
}

/** Corta a propósito: si vuelve a preguntar lo mismo, merece respuesta. */
export const REPEAT_WINDOW_MS = 60 * 1000;

async function justSaid(
  conversationId: string,
  reply: string,
): Promise<boolean> {
  const ultimo = await prismadb.conversationMessage.findFirst({
    where: {
      conversationId,
      sentBy: ConversationMessageSentBy.BOT,
      createdAt: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  return ultimo?.body === reply;
}

/**
 * Por qué el bot dejó la conversación para Paula. Se guarda en el acuse para
 * que el paso 2 sepa si puede seguir contestando productos: solo cuando fue
 * su propio «Esa no me la sé», nunca si la clienta pidió a Paula o se quejó.
 */
export type EscalationCause =
  | "no_match"
  | "owner_requested"
  | "escalate"
  | "media"
  | "button_unavailable";

async function lastEscalationCause(
  conversationId: string,
): Promise<EscalationCause | null> {
  const recientes = await prismadb.conversationMessage.findMany({
    where: {
      conversationId,
      direction: ConversationMessageDirection.OUTBOUND,
      sentBy: ConversationMessageSentBy.BOT,
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
    take: 20,
  });
  for (const mensaje of recientes) {
    const causa = (mensaje.metadata as { escalation?: EscalationCause } | null)
      ?.escalation;
    if (causa) return causa;
  }
  return null;
}

/** ¿Es lo primero que escribe en esta conversación? */
async function isFirstMessage(
  conversationId: string,
  inboundAt: Date | null | undefined,
): Promise<boolean> {
  const antes = await prismadb.conversationMessage.count({
    where: {
      conversationId,
      ...(inboundAt ? { createdAt: { lt: inboundAt } } : {}),
    },
  });
  return antes <= (inboundAt ? 0 : 1);
}

/** Lo que la clienta escribió antes de este mensaje, del más viejo al más nuevo. */
async function previousCustomerTexts(
  conversationId: string,
  inboundAt: Date | null | undefined,
): Promise<string[]> {
  const anteriores = await prismadb.conversationMessage.findMany({
    where: {
      conversationId,
      direction: ConversationMessageDirection.INBOUND,
      sentBy: ConversationMessageSentBy.CUSTOMER,
      body: { not: null },
      ...(inboundAt ? { createdAt: { lt: inboundAt } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { body: true },
    take: 3,
  });
  return anteriores
    .map((mensaje) => mensaje.body ?? "")
    .filter(Boolean)
    .reverse();
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
  /**
   * A quién se le contesta. Es el teléfono de siempre, o el BSUID cuando la
   * clienta tiene nombre de usuario y Meta no manda teléfono: dentro de la
   * ventana de atención, Meta admite las dos formas en `to`.
   */
  recipient: string;
  body: string;
  /** Id del botón tocado, si el mensaje fue un toque y no texto escrito. */
  interactiveReplyId?: string | null;
  /** Una foto, un audio, un video o un documento: lo mira Paula. */
  mediaForOwner?: boolean;
  /** Un sticker: un gesto, no una pregunta. */
  sticker?: boolean;
  /** Cuándo llegó este mensaje, para saber si ya llegó otro después. */
  inboundAt?: Date | null;
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
  /** Solo para pruebas: si no se pasa, se leen los datos de la tienda. */
  settings?: ResolvedStoreSettings;
}): Promise<WhatsAppBotResult> {
  const conversation = await prismadb.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, status: true, storeId: true, lastOwnerAt: true },
  });
  if (!conversation) return { outcome: "skipped_needs_owner" };

  // 0. Paula está en la conversación: a la clienta no le llega nada, ni
  //    siquiera si tocó «Hablar con Paula» (ella ya está ahí). Por dentro sí
  //    queda marcada, que es como le aparece pendiente en el panel.
  if (isOwnerActive(conversation.lastOwnerAt, new Date())) {
    if (conversation.status !== ConversationStatus.NEEDS_OWNER) {
      await escalate(conversation.id);
    }
    return { outcome: "skipped_owner_active" };
  }

  // 0 bis. Una ráfaga se contesta una vez, al último mensaje. Los toques de
  //    botón no entran: cada toque es una elección suya.
  if (
    !buttonIdOf(input) &&
    (await hasNewerInbound(conversation.id, input.inboundAt))
  ) {
    return { outcome: "skipped_superseded" };
  }

  const buttonId = input.interactiveReplyId?.trim() || null;

  // 1. Pidió a Paula: se le confirma y el bot se calla. Es la única salida que
  //    no se puede deshacer tocando otro botón.
  if (buttonId === TALK_TO_OWNER_BUTTON_ID) {
    const sent = await deliver(
      conversation.id,
      input.recipient,
      TALK_TO_OWNER_ACKNOWLEDGEMENT,
      [],
      pacing(input),
      // Sin el botón de «Hablar con Paula»: este mensaje ya dice que ella
      // escribe, y la escalada acaba de pasar aquí mismo. Ver `deliver`.
      { omitOwnerButton: true, escalation: "owner_requested" },
    );
    await escalate(conversation.id);
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    return sent.ok
      ? { outcome: "escalated_owner_requested" }
      : { outcome: "escalated_owner_requested", error: sent.error };
  }

  // 1 bis. Tocó un producto de una lista. El id lleva el producto, así que no
  //    hace falta interpretar nada: ni plazo, ni adivinar cuál. Va aquí arriba
  //    porque tocar es la clienta eligiendo, igual que los botones de menú.
  const productTarget = readProductTarget(buttonId);
  if (productTarget) {
    const settings =
      input.settings ?? (await readSettings(conversation.storeId));
    // Contesta con las plantillas de producto, así que pide su mismo permiso.
    // Sin él —Paula editó un texto entre la lista y el toque— se pasa a ella
    // en vez de callar, igual que con una opción que ya no existe.
    const answer =
      settings && areProductAnswersApproved(settings)
        ? await answerAboutProduct(
            conversation.storeId,
            productTarget,
            await readShownIntentForProduct(conversation.id, productTarget),
          )
        : null;
    if (!answer) {
      // El producto pudo archivarse después de mandarse la lista: una fila
      // sigue siendo tocable para siempre y aquí no hay plazo que la caduque.
      await escalate(conversation.id);
      await deliver(
        conversation.id,
        input.recipient,
        UNAVAILABLE_OPTION_ACKNOWLEDGEMENT,
        [],
        pacing(input),
        { escalation: "button_unavailable" },
      );
      return { outcome: "escalated_button_unavailable" };
    }
    const sent = await deliver(
      conversation.id,
      input.recipient,
      answer.text,
      [],
      pacing(input),
      {
        photo: answer.photo,
        // Abre ventana nueva: si después escribe «ese», eso es lo que señala.
        shown: answer.shownIds
          ? { ids: answer.shownIds, intent: answer.intent }
          : null,
      },
    );
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    if (sent.ok) {
      return { outcome: "replied_product_reference", trigger: answer.intent };
    }
    await escalate(conversation.id);
    return {
      outcome: "escalated_send_failed",
      trigger: answer.intent,
      error: sent.error,
    };
  }

  // 1 ter. Tocó una forma de pago. Igual que las filas de producto: el id
  //    dice qué se tocó, así que no hay nada que interpretar. «Transferencia»
  //    no contesta, abre el segundo menú; las demás sí contestan.
  const paymentTarget = parsePaymentOption(readPaymentTarget(buttonId));
  if (paymentTarget) {
    const settings =
      input.settings ?? (await readSettings(conversation.storeId));
    const leaf =
      settings && areBusinessFactsApproved(settings)
        ? renderPaymentOption(paymentTarget, settings)
        : null;

    // La opción existía cuando se enseñó el menú pero ya no: Paula vació ese
    // campo, o retiró el visto bueno. No se calla ni se inventa: pasa a ella.
    if (!leaf) {
      await escalate(conversation.id);
      await deliver(
        conversation.id,
        input.recipient,
        UNAVAILABLE_OPTION_ACKNOWLEDGEMENT,
        [],
        pacing(input),
        { escalation: "button_unavailable" },
      );
      return { outcome: "escalated_button_unavailable" };
    }

    const sent = await deliver(
      conversation.id,
      input.recipient,
      leaf.text,
      [],
      pacing(input),
      {
        photo: leaf.photo,
        ...(leaf.rows && leaf.rows.length > 0
          ? { list: { body: leaf.text, rows: leaf.rows } }
          : {}),
      },
    );
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    if (sent.ok) {
      return {
        outcome: "replied_business_fact",
        trigger: `payment.${paymentTarget}`,
      };
    }
    await escalate(conversation.id);
    return {
      outcome: "escalated_send_failed",
      trigger: `payment.${paymentTarget}`,
      error: sent.error,
    };
  }

  // 1 quater. Tocó una fila del menú de bienvenida. Igual que `pay:`: el id
  //    dice qué dato quiere, así que no hay nada que interpretar. Las filas
  //    llevan a las MISMAS respuestas que salen de los ajustes, no a un texto
  //    copiado, para que no se desfasen cuando Paula cambie un número.
  const factTarget = readFactTarget(buttonId) as BusinessFactIntent | null;
  if (factTarget) {
    const settings =
      input.settings ?? (await readSettings(conversation.storeId));
    const answer =
      settings && areBusinessFactsApproved(settings)
        ? renderBusinessFact(factTarget, settings)
        : null;
    if (!answer) {
      await escalate(conversation.id);
      await deliver(
        conversation.id,
        input.recipient,
        UNAVAILABLE_OPTION_ACKNOWLEDGEMENT,
        [],
        pacing(input),
        { escalation: "button_unavailable" },
      );
      return { outcome: "escalated_button_unavailable" };
    }
    // «Cómo pagar» no es un texto sino la puerta al menú de pagos de siempre.
    const filas =
      factTarget === "payment.methods" && settings
        ? buildPaymentMenuRows(settings)
        : [];
    const sent = await deliver(
      conversation.id,
      input.recipient,
      answer,
      [],
      pacing(input),
      filas.length > 0 ? { list: { body: answer, rows: filas } } : {},
    );
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    if (sent.ok) {
      return { outcome: "replied_business_fact", trigger: factTarget };
    }
    await escalate(conversation.id);
    return {
      outcome: "escalated_send_failed",
      trigger: factTarget,
      error: sent.error,
    };
  }

  const buttonTarget = readButtonTarget(buttonId);

  // 2. Detenido: la conversación ya espera a una persona. Un mensaje escrito
  //    no la despierta; tocar un botón sí, porque es la clienta eligiendo.
  //    Una excepción: si la dejó así el propio «Esa no me la sé» del bot y
  //    Paula no ha escrito nunca, una pregunta clara de producto se sigue
  //    contestando (la conversación queda en la cola de Paula igual). Si la
  //    clienta pidió a Paula, se quejó o Paula ya escribió, silencio.
  let soloProductos = false;
  if (conversation.status === ConversationStatus.NEEDS_OWNER && !buttonTarget) {
    if (
      conversation.lastOwnerAt ||
      input.mediaForOwner ||
      input.sticker ||
      (await lastEscalationCause(conversation.id)) !== "no_match"
    ) {
      return { outcome: "skipped_needs_owner" };
    }
    soloProductos = true;
  }

  // 2 bis. Una foto o un audio: lo que importa está dentro y el bot no lo ve.
  //    Va tras el portón de arriba para no acusar recibo dos veces.
  if (input.mediaForOwner) {
    // Se marca primero, igual que en el paso 6: la pausa humana dura segundos
    // y en ese rato puede entrar otra foto de la misma ráfaga.
    await escalate(conversation.id);
    const sent = await deliver(
      conversation.id,
      input.recipient,
      UNREADABLE_MEDIA_ACKNOWLEDGEMENT,
      [],
      pacing(input),
      // Sin el botón de «Hablar con Paula»: este mensaje ya dice que ella
      // escribe, y la escalada acaba de pasar aquí mismo. Ver `deliver`.
      { omitOwnerButton: true, escalation: "media" },
    );
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    return sent.ok
      ? { outcome: "escalated_unprocessable_media" }
      : { outcome: "escalated_unprocessable_media", error: sent.error };
  }

  const enviarEnlace = (cuerpo: string, url: string, button: string) =>
    deliver(
      conversation.id,
      input.recipient,
      cuerpo,
      [],
      { ...pacing(input), skip: true },
      { link: { url, button } },
    );
  const enviarCatalogo = async () => {
    const enviado = await enviarEnlace(
      CATALOG_MESSAGE_BODY,
      buildCatalogUrl(env.FRONTEND_STORE_URL),
      CATALOG_BUTTON_TEXT,
    );
    if (!enviado.ok && !enviado.aborted) {
      console.warn("[WHATSAPP_BOT] No salió el enlace al catálogo", {
        conversationId: conversation.id,
        error: enviado.error,
      });
    }
  };

  /** El menú de bienvenida y el catálogo; `null` si Paula aún no aprobó los datos. */
  const darBienvenida = async (): Promise<WhatsAppBotResult | null> => {
    const welcomeSettings =
      input.settings ?? (await readSettings(conversation.storeId));
    if (!welcomeSettings || !areBusinessFactsApproved(welcomeSettings)) {
      return null;
    }
    const cuerpo = BUSINESS_FACT_TEMPLATES["welcome.body"]();
    const filas = buildWelcomeMenuRows(welcomeSettings);
    const sent = await deliver(
      conversation.id,
      input.recipient,
      cuerpo,
      [],
      pacing(input),
      filas.length > 0
        ? {
            list: {
              body: cuerpo,
              rows: filas,
              section: BUSINESS_FACT_TEMPLATES["welcome.section"](),
            },
          }
        : {},
    );
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    if (sent.ok) {
      await enviarCatalogo();
      return { outcome: "replied_business_fact", trigger: "welcome" };
    }
    await escalate(conversation.id);
    return {
      outcome: "escalated_send_failed",
      trigger: "welcome",
      error: sent.error,
    };
  };

  // 2 ter. Un sticker es un gesto: si abre la conversación se saluda; a mitad
  //    de ella no se contesta. Ya no va a Paula como adjunto.
  if (input.sticker) {
    if (await isFirstMessage(conversation.id, input.inboundAt)) {
      const bienvenida = await darBienvenida();
      if (bienvenida) return bienvenida;
    }
    return { outcome: "skipped_acknowledgement" };
  }

  // 3. Por botón se sirve la respuesta exacta a la que apunta, sin pasar por
  //    los disparadores. Si ya no se puede mandar (borrada, apagada o sin la
  //    aprobación de Paula) la conversación pasa a ella en vez de callar.
  if (buttonTarget) {
    const target =
      input.keywords?.find((keyword) => keyword.id === buttonTarget) ??
      (input.keywords
        ? null
        : await getSendableBotReply(conversation.storeId, buttonTarget));
    if (!target) {
      await escalate(conversation.id);
      await deliver(
        conversation.id,
        input.recipient,
        UNAVAILABLE_OPTION_ACKNOWLEDGEMENT,
        [],
        pacing(input),
        { escalation: "button_unavailable" },
      );
      return { outcome: "escalated_button_unavailable" };
    }
    return respond(
      conversation.id,
      input.recipient,
      target,
      undefined,
      pacing(input),
    );
  }

  // 4. Datos del negocio: horario, ciudad, local, mínimo, envío gratis y
  //    cuánto tarda. La respuesta se arma con el dato guardado, nunca con uno
  //    inventado: si el campo está vacío, esto no contesta y el mensaje sigue
  //    su camino hasta quedar para Paula.
  const factIntent = soloProductos ? null : classifyBusinessFact(input.body);
  if (factIntent) {
    const settings =
      input.settings ?? (await readSettings(conversation.storeId));
    // Los textos salen solo con el visto bueno de Paula, y editar uno en el
    // código lo retira. Sin aprobación esto no es un error: se sigue de largo.
    if (settings && areBusinessFactsApproved(settings)) {
      const answer = renderBusinessFact(factIntent, settings);
      if (answer) {
        // «Cómo se paga» no es un texto sino un menú: tres formas de pago más
        // la salida a Paula son cuatro opciones, y de botones solo caben tres.
        const filas =
          factIntent === "payment.methods"
            ? buildPaymentMenuRows(settings)
            : [];
        const sent = await deliver(
          conversation.id,
          input.recipient,
          answer,
          // Sin menú propio: `deliver` ya añade «Hablar con Paula», que es la
          // salida que lleva todo mensaje del bot.
          [],
          pacing(input),
          filas.length > 0 ? { list: { body: answer, rows: filas } } : {},
        );
        if (sent.aborted) return { outcome: "skipped_owner_active" };
        if (sent.ok) {
          return { outcome: "replied_business_fact", trigger: factIntent };
        }
        // Si no salió, se trata como cualquier envío fallido: pasa a Paula.
        await escalate(conversation.id);
        return {
          outcome: "escalated_send_failed",
          trigger: factIntent,
          error: sent.error,
        };
      }
    }
  }

  // 4 bis. «El primero», «ese», «el 2»: señalar sin nombrar. Va ANTES del
  //    paso 5 porque ahí no hay nada que buscar —«el primero» no tiene ni una
  //    palabra de producto— y acabaría gastando una llamada al modelo para
  //    terminar igual en «esa no me la sé».
  const reference = detectProductReference(input.body);
  if (reference) {
    const refSettings =
      input.settings ?? (await readSettings(conversation.storeId));
    // Contesta con las mismas plantillas del paso 5, así que pide el mismo
    // visto bueno.
    if (refSettings && areProductAnswersApproved(refSettings)) {
      const resolved = await resolveProductReference({
        conversationId: conversation.id,
        storeId: conversation.storeId,
        reference,
      });

      if (resolved.outcome === "resolved") {
        const answer = await answerAboutProduct(
          conversation.storeId,
          resolved.productId,
          resolved.intent,
        );
        if (answer) {
          const sent = await deliver(
            conversation.id,
            input.recipient,
            answer.text,
            [],
            pacing(input),
            {
              photo: answer.photo,
              shown: answer.shownIds
                ? { ids: answer.shownIds, intent: answer.intent }
                : null,
              list: answer.list,
            },
          );
          if (sent.aborted) return { outcome: "skipped_owner_active" };
          if (sent.ok) {
            return {
              outcome: "replied_product_reference",
              trigger: answer.intent,
            };
          }
          await escalate(conversation.id);
          return {
            outcome: "escalated_send_failed",
            trigger: answer.intent,
            error: sent.error,
          };
        }
      } else if (resolved.outcome === "lost") {
        // No se escala: se admite el despiste y se le pide que lo repita, que
        // es una conversación de un mensaje más y no una espera a Paula.
        const sent = await deliver(
          conversation.id,
          input.recipient,
          PRODUCT_TEMPLATES["reference.lost"](),
          [],
          pacing(input),
        );
        if (sent.aborted) return { outcome: "skipped_owner_active" };
        if (sent.ok) return { outcome: "replied_reference_lost" };
        await escalate(conversation.id);
        return { outcome: "escalated_send_failed", error: sent.error };
      }
      // `none` —y un producto del que no se pudo contar nada— siguen su camino
      // sin tocar nada, como si esto no existiera.
    }
  }

  const responderPalabraClave = async (): Promise<WhatsAppBotResult | null> => {
    const keywords =
      input.keywords ?? (await getActiveBotKeywords(conversation.storeId));
    const match = matchWhatsAppKeyword(input.body, keywords);
    return match
      ? respond(
          conversation.id,
          input.recipient,
          match.keyword,
          match.trigger,
          pacing(input),
        )
      : null;
  };

  // 4 ter. Solo emojis: si abre la conversación se saluda; si no, no hay
  //    pregunta que contestar.
  if (isEmojiOnly(input.body)) {
    if (
      !soloProductos &&
      (await isFirstMessage(conversation.id, input.inboundAt))
    ) {
      const bienvenida = await darBienvenida();
      if (bienvenida) return bienvenida;
    }
    return soloProductos
      ? { outcome: "skipped_needs_owner" }
      : { outcome: "skipped_acknowledgement" };
  }

  // 4 quater. Una sola llamada a OpenAI decide de qué va el mensaje y, si es
  //    de productos, qué buscar con lo que dijo antes. Si falla, todo sigue
  //    como antes: palabras clave, la búsqueda de siempre y, si nada, Paula.
  // «Escribiendo…» ya, antes de pensar: la llamada puede tardar unos segundos
  // y sin el indicador la clienta mira un chat quieto.
  if (input.inboundMessageId) {
    const typing = await sendWhatsAppTypingIndicator(input.inboundMessageId);
    if (!typing.ok) {
      console.warn("[WHATSAPP_BOT] No se pudo mostrar «escribiendo…»", {
        error: typing.error,
      });
    }
  }
  const intencion: IntentOutcome = await classifyMessageIntent(
    input.body,
    await previousCustomerTexts(conversation.id, input.inboundAt),
  );
  const entendido = intencion.ok ? intencion.value : null;
  if (!intencion.ok && intencion.reason !== "not_configured") {
    console.warn("[WHATSAPP_BOT] No se pudo clasificar el mensaje", {
      conversationId: conversation.id,
      reason: intencion.reason,
    });
  }

  if (!soloProductos) {
    // Saludó, aunque sea con un párrafo («Hola, los encontré en la página…»):
    // menú de bienvenida. Sin el visto bueno de Paula, sigue a sus palabras
    // clave como hasta ahora.
    if (isWelcomeGreeting(input.body) || entendido?.intent === "greeting") {
      const bienvenida = await darBienvenida();
      if (bienvenida) return bienvenida;
    }

    if (entendido?.intent === "acknowledgement") {
      return { outcome: "skipped_acknowledgement" };
    }

    // Queja, problema con un pedido o un pago: a Paula, sin improvisar nada.
    if (entendido?.intent === "escalate") {
      await escalate(conversation.id);
      const sent = await deliver(
        conversation.id,
        input.recipient,
        TALK_TO_OWNER_ACKNOWLEDGEMENT,
        [],
        pacing(input),
        { omitOwnerButton: true, escalation: "escalate" },
      );
      if (sent.aborted) return { outcome: "skipped_owner_active" };
      return sent.ok
        ? { outcome: "escalated_complaint" }
        : { outcome: "escalated_complaint", error: sent.error };
    }

    // Gracias, despedida, «¿eres un robot?», «¿qué venden?»: texto fijo y
    // aprobado. Sin aprobación, sigue de largo como hasta ahora.
    if (entendido && isCasualIntent(entendido.intent)) {
      const casualSettings =
        input.settings ?? (await readSettings(conversation.storeId));
      if (casualSettings && areCasualRepliesApproved(casualSettings)) {
        const sent = await deliver(
          conversation.id,
          input.recipient,
          CASUAL_TEMPLATES[entendido.intent](),
          [],
          pacing(input),
        );
        if (sent.aborted) return { outcome: "skipped_owner_active" };
        if (sent.ok) {
          if (entendido.intent === "catalog_question") await enviarCatalogo();
          return { outcome: "replied_casual", trigger: entendido.intent };
        }
        await escalate(conversation.id);
        return {
          outcome: "escalated_send_failed",
          trigger: entendido.intent,
          error: sent.error,
        };
      }
    }

    // 5. Lo que Paula escribió gana al catálogo: va antes que la búsqueda,
    //    salvo cuando el mensaje es claramente de productos («gracias! ¿y
    //    tienen agendas?» no es un «gracias»); entonces va después.
    if (entendido?.intent !== "product") {
      const respuesta = await responderPalabraClave();
      if (respuesta) return respuesta;
    }
  }

  // 6. Productos. Con el clasificador, la búsqueda usa lo que entendió con el
  //    contexto (y solo lo que hay en existencia); sin él, el camino de antes,
  //    que primero mira si «parece» pregunta de producto.
  const clasificacion = entendido ? toProductClassification(entendido) : null;
  const esProducto = entendido
    ? entendido.intent === "product"
    : looksLikeProductQuestion(input.body);
  if (esProducto) {
    const productSettings =
      input.settings ?? (await readSettings(conversation.storeId));
    const aprobados = Boolean(
      productSettings && areProductAnswersApproved(productSettings),
    );
    const answer =
      aprobados && (!entendido || clasificacion)
        ? await answerProductQuestion(conversation.storeId, input.body, {
            ...(clasificacion
              ? {
                  classification: clasificacion,
                  filters: {
                    inStockOnly: true,
                    maxPrice: entendido?.filters.budget ?? null,
                  },
                }
              : {}),
            // Sale solo si la clasificación se hace larga. Sin lista y sin
            // pausa humana: ya se ha esperado bastante, y `deliver` no le
            // pone `shown`, así que no estorba a «el primero» —la etapa de
            // referencias busca el último mensaje CON lista y este no la
            // lleva, igual que cualquier otro acuse.
            onSlow: async () => {
              const avisado = await deliver(
                conversation.id,
                input.recipient,
                SLOW_ANSWER_ACKNOWLEDGEMENT,
                [],
                { ...pacing(input), skip: true },
              );
              if (!avisado.ok) {
                console.warn("[WHATSAPP_BOT] No salió el aviso de espera", {
                  conversationId: conversation.id,
                  error: avisado.error,
                });
              }
            },
          })
        : null;
    if (answer) {
      // Sin nada seguro que decir, el texto promete que Paula escribe: se
      // marca ANTES de mandar, igual que en el paso 7, para que un segundo
      // mensaje durante la pausa no vuelva a contestar.
      if (answer.handoff) await escalate(conversation.id);
      const sent = await deliver(
        conversation.id,
        input.recipient,
        answer.text,
        [],
        pacing(input),
        {
          photo: answer.photo,
          shown: answer.shownIds
            ? { ids: answer.shownIds, intent: answer.intent }
            : null,
          list: answer.list,
          decision: answer.decision,
          omitOwnerButton: Boolean(answer.handoff),
          ...(answer.handoff ? { escalation: "no_match" as const } : {}),
        },
      );
      if (sent.aborted) return { outcome: "skipped_owner_active" };
      if (sent.ok) {
        if (answer.handoff) {
          await enviarCatalogo();
        } else if (clasificacion?.productType) {
          const enlace = await enviarEnlace(
            SEARCH_LINK_BODY,
            buildSearchUrl(env.FRONTEND_STORE_URL, {
              query: clasificacion.productType,
              budget: entendido?.filters.budget ?? null,
            }),
            SEARCH_BUTTON_TEXT,
          );
          if (!enlace.ok && !enlace.aborted) {
            console.warn("[WHATSAPP_BOT] No salió el enlace de la búsqueda", {
              conversationId: conversation.id,
              error: enlace.error,
            });
          }
        }
        return {
          outcome: answer.handoff
            ? "replied_product_unsure"
            : "replied_product",
          trigger: answer.intent,
        };
      }
      await escalate(conversation.id);
      return {
        outcome: "escalated_send_failed",
        trigger: answer.intent,
        error: sent.error,
      };
    }
  }

  // Esperando a Paula por un «Esa no me la sé» del bot: lo que no es una
  // pregunta de producto con respuesta se deja para ella, en silencio.
  if (soloProductos) return { outcome: "skipped_needs_owner" };

  // Era de productos y la búsqueda no tuvo qué decir: las palabras clave de
  // Paula todavía pueden contestar.
  if (entendido?.intent === "product") {
    const respuesta = await responderPalabraClave();
    if (respuesta) return respuesta;
  }

  // 6 bis. Escribió a mano lo que dice el botón. Hoy no pasa —los 23 «Hablar
  //    con Paula» de septiembre fueron toques— pero si pasara caería en el
  //    paso 7 y se le contestaría «Esa no me la sé» a alguien que está pidiendo
  //    una persona, que es lo contrario de lo que necesita oír. Va después de
  //    las palabras clave para que una respuesta de Paula siga mandando.
  if (
    normalizeBotText(input.body) ===
    normalizeBotText(TALK_TO_OWNER_BUTTON_TITLE)
  ) {
    const sent = await deliver(
      conversation.id,
      input.recipient,
      TALK_TO_OWNER_ACKNOWLEDGEMENT,
      [],
      pacing(input),
      // Sin el botón de «Hablar con Paula»: este mensaje ya dice que ella
      // escribe, y la escalada acaba de pasar aquí mismo. Ver `deliver`.
      { omitOwnerButton: true, escalation: "owner_requested" },
    );
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    await escalate(conversation.id);
    return sent.ok
      ? { outcome: "escalated_owner_requested" }
      : { outcome: "escalated_owner_requested", error: sent.error };
  }

  // 7. Nada encajó: no se inventa una respuesta, se le pasa a Paula, y se le
  //    deja el catálogo para que no se quede sin nada mientras tanto.
  //
  //    El orden importa: se marca primero. La pausa humana de `deliver` dura
  //    segundos y en ese rato puede entrar otro mensaje; con la conversación
  //    ya marcada, ese segundo mensaje se salta y no se avisa dos veces.
  await escalate(conversation.id);
  const avisado = await deliver(
    conversation.id,
    input.recipient,
    NO_MATCH_ACKNOWLEDGEMENT,
    [],
    pacing(input),
    { escalation: "no_match" },
  );
  if (avisado.ok && !avisado.aborted) await enviarCatalogo();
  return { outcome: "escalated_no_match" };
}

interface Pacing {
  inboundMessageId: string | null;
  skip: boolean;
  /** Cuándo llegó el mensaje que se está contestando. */
  inboundAt: Date | null;
  /**
   * Si una ráfaga posterior puede dejar esta respuesta obsoleta. Los toques de
   * botón no: cada toque es una elección suya y se contesta siempre.
   */
  supersedable: boolean;
}

function pacing(input: {
  inboundMessageId?: string | null;
  skipHumanPause?: boolean;
  inboundAt?: Date | null;
  interactiveReplyId?: string | null;
}): Pacing {
  return {
    inboundMessageId: input.inboundMessageId?.trim() || null,
    skip: Boolean(input.skipHumanPause),
    inboundAt: input.inboundAt ?? null,
    supersedable: !input.interactiveReplyId?.trim(),
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
  const sent = await deliver(
    conversationId,
    phone,
    keyword.answer,
    keyword.buttons ?? [],
    pace,
  );
  if (sent.aborted) return { outcome: "skipped_owner_active" };
  if (!sent.ok) {
    await escalate(conversationId);
    return { outcome: "escalated_send_failed", trigger, error: sent.error };
  }
  return trigger ? { outcome: "replied", trigger } : { outcome: "replied" };
}

/**
 * Envía y archiva. Con botones casi siempre: aunque la respuesta no tenga
 * menú, va el de «Hablar con Paula», que es la promesa que se le hizo a la
 * clienta.
 *
 * Las dos excepciones son los acuses que cierran una escalada hecha en esta
 * misma llamada —`TALK_TO_OWNER_ACKNOWLEDGEMENT` y
 * `UNREADABLE_MEDIA_ACKNOWLEDGEMENT`—, que se mandan con
 * `omitOwnerButton: true`. Esos mensajes ya dicen que Paula escribe enseguida:
 * dejar el botón ahí invita a tocar algo que ya se hizo, y el segundo toque o
 * repite el mismo texto o no enseña nada. Ver `buildReplyButtons`.
 */
async function deliver(
  conversationId: string,
  phone: string,
  answer: string,
  buttons: { title: string; targetReplyId: string }[],
  pace: Pacing,
  extras: {
    /** Foto que va encima del texto, si el producto tiene una utilizable. */
    photo?: string | null;
    /**
     * Qué productos enseña este mensaje. Se guarda para poder resolver después
     * un «el primero»; no se enseña nunca ni sale de aquí.
     */
    shown?: ShownProducts | null;
    /**
     * Las opciones tocables. `answer` queda como la versión escrita.
     * `button` y `section` se pueden cambiar: el menú de bienvenida no dice
     * «Elige uno» como el de productos.
     */
    list?: {
      body: string;
      rows: WhatsAppListRow[];
      button?: string;
      section?: string;
    } | null;
    /**
     * Manda el mensaje sin el botón de «Hablar con Paula». Solo para los
     * acuses que cierran una escalada ya hecha; ver `buildReplyButtons`.
     */
    omitOwnerButton?: boolean;
    /**
     * Qué entendió y qué buscó el bot al contestar sobre productos. Se archiva
     * con el mensaje para poder revisarlo después; nunca se enseña.
     */
    decision?: ProductDecision | null;
    /** Por qué este acuse deja la conversación para Paula; ver `lastEscalationCause`. */
    escalation?: EscalationCause;
    /**
     * Un enlace en vez de una respuesta: va como botón que lo abre o como
     * texto, según `CATALOG_LINK_MODE`, y sin el botón de Paula, porque sale
     * justo después de un mensaje que ya lo trae.
     */
    link?: { url: string; button: string };
  } = {},
): Promise<{ ok: boolean; error?: string; aborted?: boolean }> {
  const { photo, shown, list, omitOwnerButton, decision, escalation, link } =
    extras;
  const metadata = {
    ...(shown && shown.ids.length > 0 ? { shown } : {}),
    ...(decision ? { decision } : {}),
    ...(escalation ? { escalation } : {}),
    ...(link ? { link: link.url } : {}),
  };
  const conMetadata =
    Object.keys(metadata).length > 0
      ? { metadata: metadata as unknown as Prisma.InputJsonValue }
      : {};
  const reply = formatBotReply(answer);

  // Red contra un envío doble; las ráfagas se resuelven antes.
  if (await justSaid(conversationId, reply)) {
    console.info("[WHATSAPP_BOT] Se evita repetir lo mismo", {
      conversationId,
    });
    return { ok: true };
  }

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

  // Volver a decidir DESPUÉS de la pausa. Esta es la corrección de fondo: el
  // freno de 24 h se miraba una sola vez, al entrar, y entre esa mirada y este
  // punto pasan hasta 7 segundos. Si Paula contestó en ese rato, su eco ya
  // marcó `lastOwnerAt` y esta respuesta le caería encima —lo que pasó 11
  // veces entre el 16 y el 21 de septiembre, p. ej. en b3ae6030, donde ella
  // saludó y el bot saludó un segundo después.
  //
  // Al abortar NO se toca el estado: el eco acaba de dejar la conversación
  // como ella la quiere y pelearse con él sería volver al problema anterior.
  const frenada = await shouldStayQuiet(conversationId, pace);
  if (frenada) {
    console.info(
      "[WHATSAPP_BOT] Se calla: la conversación cambió durante la pausa",
      {
        conversationId,
        motivo: frenada,
      },
    );
    return { ok: true, aborted: true };
  }

  const conBotones = buildReplyButtons(buttons, {
    includeOwnerButton: !omitOwnerButton,
  });

  /**
   * El texto por el camino que corresponda: interactivo si hay botones, y
   * mensaje normal si no queda ninguno.
   *
   * Sin esto los dos acuses con `omitOwnerButton` no saldrían. Meta no acepta
   * un interactivo con cero botones, y `sendWhatsAppButtonMessage` ni lo
   * intenta: corta antes con «sin botones que mandar». O sea que quitar el
   * botón sin esta salida dejaría a la clienta sin el acuse, que es peor que
   * el problema que se quería arreglar.
   */
  const enviarTexto = () =>
    link
      ? CATALOG_LINK_MODE === "cta_url"
        ? sendWhatsAppCtaUrlMessage(phone, reply, {
            text: link.button,
            url: link.url,
          })
        : sendWhatsAppTextMessage(phone, `${reply}\n${link.url}`)
      : conBotones.length > 0
        ? sendWhatsAppButtonMessage(phone, reply, conBotones)
        : sendWhatsAppTextMessage(phone, reply);

  let salioConFoto = Boolean(photo);

  // La lista manda cuando la hay: una lista no admite ni foto ni botones, así
  // que la salida hacia Paula viaja como una fila más, la última.
  let archivado = link ? `${reply}\n${link.url}` : reply;
  let sent;
  if (list && list.rows.length > 0) {
    salioConFoto = false;
    const cuerpo = formatBotReply(list.body);
    sent = await sendWhatsAppListMessage(phone, cuerpo, {
      button: list.button ?? PRODUCT_TEMPLATES["list.button"](),
      section: list.section ?? PRODUCT_TEMPLATES["list.section"](),
      footer: PRODUCT_TEMPLATES["list.footer"](),
      rows: [...list.rows, buildOwnerRow()],
    });
    if (sent.ok) {
      // En el panel tiene que verse lo que se le ofreció, no solo la frase.
      archivado = [
        cuerpo,
        ...list.rows.map((r) => `• ${r.description ?? r.title}`),
      ].join("\n");
    } else {
      // Si Meta la rechaza se manda la versión escrita de siempre, que lleva
      // las mismas opciones y el botón de Paula. Perder la lista es un
      // detalle; dejar a la clienta sin respuesta, no.
      console.warn("[WHATSAPP_BOT] La lista no salió; se manda el texto", {
        conversationId,
        error: sent.error,
      });
      sent = await enviarTexto();
    }
  } else {
    sent = photo
      ? await sendWhatsAppImageButtonMessage(phone, reply, conBotones, photo)
      : await enviarTexto();
  }

  // Si lo que falló fue la foto (URL caída, formato raro, un no de Meta), se
  // manda el MISMO texto sin ella. Perder la foto es un detalle; dejar a la
  // clienta sin respuesta, no. Es el único reintento que hace el bot, y solo
  // porque el primer envío no llegó a salir.
  if (!sent.ok && photo) {
    console.warn("[WHATSAPP_BOT] La foto no salió; se manda solo el texto", {
      conversationId,
      error: sent.error,
    });
    salioConFoto = false;
    sent = await enviarTexto();
  }

  if (!sent.ok) {
    // Queda el intento escrito para que se vea qué se quiso mandar. No se
    // reintenta nunca: un reintento a ciegas le llega dos veces a la clienta.
    await prismadb.conversationMessage.create({
      data: {
        conversationId,
        direction: ConversationMessageDirection.OUTBOUND,
        sentBy: ConversationMessageSentBy.BOT,
        body: archivado,
        // La decisión también aquí: si el envío falló, saber qué se quiso
        // decir y por qué es justo lo que hace falta para revisarlo.
        ...(decision
          ? { metadata: { decision } as unknown as Prisma.InputJsonValue }
          : {}),
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
      body: archivado,
      // Solo si de verdad salió con foto: si hubo que repetir sin ella, en el
      // panel tiene que verse lo mismo que le llegó a la clienta.
      ...(salioConFoto && photo ? { mediaType: "image", mediaUrl: photo } : {}),
      ...conMetadata,
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
