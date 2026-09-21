import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  ConversationStatus,
  type Prisma,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { getStoreSettings, type ResolvedStoreSettings } from "@/lib/store-settings";
import {
  areBusinessFactsApproved,
  buildPaymentMenuRows,
  classifyBusinessFact,
  parsePaymentOption,
  renderBusinessFact,
  renderPaymentOption,
} from "@/lib/whatsapp/bot-facts";
import {
  PRODUCT_TEMPLATES,
  areProductAnswersApproved,
  answerAboutProduct,
  answerProductQuestion,
  buildOwnerRow,
  looksLikeProductQuestion,
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
} from "@/lib/whatsapp/bot-replies";
import {
  sendWhatsAppButtonMessage,
  sendWhatsAppImageButtonMessage,
  sendWhatsAppListMessage,
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
  /** Dijo «el primero» y se supo cuál era. */
  | "replied_product_reference"
  /** Señaló una opción de una lista que ya no valía; se le pidió repetirla. */
  | "replied_reference_lost"
  /** Llegó un adjunto sin texto: no hay nada que clasificar, va para Paula. */
  | "escalated_unprocessable_media"
  /** Ya llegó otro mensaje después: contesta ese, no este. */
  | "skipped_superseded"
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
export const SLOW_ANSWER_ACKNOWLEDGEMENT =
  "Dame un segundito que lo busco 💛";

/** «Lo que me enviaste» y no «tu foto»: por aquí pasan audios y documentos. */
export const UNREADABLE_MEDIA_ACKNOWLEDGEMENT =
  "Recibí lo que me enviaste 💛 Se lo paso a Paula y ella te escribe apenas pueda.";

/** Cuando el botón apunta a una respuesta que ya no está disponible. */
export const UNAVAILABLE_OPTION_ACKNOWLEDGEMENT =
  "Esa opción ya no está disponible 💛 Le aviso a Paula para que te ayude.";

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
  return [
    ...menu,
    { id: TALK_TO_OWNER_BUTTON_ID, title: TALK_TO_OWNER_BUTTON_TITLE },
  ];
}

/**
 * Cuánto se aparta el bot después de que Paula escriba.
 *
 * Un día: cubre que ella conteste de noche y siga por la mañana. Pasado eso
 * el hilo se da por frío y el bot vuelve a atender, que es justo lo que el
 * parche del 2026-09-15 no hacía: callaba para siempre.
 */
export const OWNER_TAKEOVER_WINDOW_HOURS = 24;

export function isOwnerActive(
  lastOwnerAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!lastOwnerAt) return false;
  return (
    now.getTime() - lastOwnerAt.getTime() <
    OWNER_TAKEOVER_WINDOW_HOURS * 60 * 60 * 1000
  );
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

function buttonIdOf(input: { interactiveReplyId?: string | null }): string | null {
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
  if (pace.supersedable && (await hasNewerInbound(conversationId, pace.inboundAt))) {
    return "superseded";
  }
  return null;
}

/** Corta a propósito: si vuelve a preguntar lo mismo, merece respuesta. */
export const REPEAT_WINDOW_MS = 60 * 1000;

async function justSaid(conversationId: string, reply: string): Promise<boolean> {
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
  if (!buttonIdOf(input) && (await hasNewerInbound(conversation.id, input.inboundAt))) {
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
      return { outcome: "replied_business_fact", trigger: `payment.${paymentTarget}` };
    }
    await escalate(conversation.id);
    return {
      outcome: "escalated_send_failed",
      trigger: `payment.${paymentTarget}`,
      error: sent.error,
    };
  }

  const buttonTarget = readButtonTarget(buttonId);

  // 2. Detenido: la conversación ya espera a una persona. Un mensaje escrito
  //    no la despierta; tocar un botón sí, porque es la clienta eligiendo.
  if (conversation.status === ConversationStatus.NEEDS_OWNER && !buttonTarget) {
    return { outcome: "skipped_needs_owner" };
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
    );
    if (sent.aborted) return { outcome: "skipped_owner_active" };
    return sent.ok
      ? { outcome: "escalated_unprocessable_media" }
      : { outcome: "escalated_unprocessable_media", error: sent.error };
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
  const factIntent = classifyBusinessFact(input.body);
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
          factIntent === "payment.methods" ? buildPaymentMenuRows(settings) : [];
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

  // 5. Lo que Paula escribió gana al catálogo: va antes que la búsqueda.
  const keywords =
    input.keywords ?? (await getActiveBotKeywords(conversation.storeId));
  const match = matchWhatsAppKeyword(input.body, keywords);
  if (match) {
    return respond(
      conversation.id,
      input.recipient,
      match.keyword,
      match.trigger,
      pacing(input),
    );
  }

  // 6. Productos: si tienen algo y si queda. A diferencia del paso 4, aquí
  //    hace falta un modelo para entender la pregunta, así que TODO lo que
  //    pueda salir mal —sin clave, sin cuota, lento, o una respuesta que no
  //    cuadra— acaba igual: sin contestar aquí y siguiendo al paso 6.
  if (looksLikeProductQuestion(input.body)) {
    const productSettings =
      input.settings ?? (await readSettings(conversation.storeId));
    const answer =
      productSettings && areProductAnswersApproved(productSettings)
        ? await answerProductQuestion(conversation.storeId, input.body, {
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
        return { outcome: "replied_product", trigger: answer.intent };
      }
      await escalate(conversation.id);
      return {
        outcome: "escalated_send_failed",
        trigger: answer.intent,
        error: sent.error,
      };
    }
  }

  // 7. Nada encajó: no se inventa una respuesta, se le pasa a Paula.
  //
  //    El orden importa: se marca primero. La pausa humana de `deliver` dura
  //    segundos y en ese rato puede entrar otro mensaje; con la conversación
  //    ya marcada, ese segundo mensaje se salta y no se avisa dos veces.
  await escalate(conversation.id);
  await deliver(
    conversation.id,
    input.recipient,
    NO_MATCH_ACKNOWLEDGEMENT,
    [],
    pacing(input),
  );
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
 * Envía y archiva. Siempre con botones: aunque la respuesta no tenga menú,
 * va el de «Hablar con Paula», que es la promesa que se le hizo a la clienta.
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
    /** Las opciones tocables. `answer` queda como la versión escrita. */
    list?: { body: string; rows: WhatsAppListRow[] } | null;
  } = {},
): Promise<{ ok: boolean; error?: string; aborted?: boolean }> {
  const { photo, shown, list } = extras;
  const reply = formatBotReply(answer);

  // Red contra un envío doble; las ráfagas se resuelven antes.
  if (await justSaid(conversationId, reply)) {
    console.info("[WHATSAPP_BOT] Se evita repetir lo mismo", { conversationId });
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
    console.info("[WHATSAPP_BOT] Se calla: la conversación cambió durante la pausa", {
      conversationId,
      motivo: frenada,
    });
    return { ok: true, aborted: true };
  }

  const conBotones = buildReplyButtons(buttons);
  let salioConFoto = Boolean(photo);

  // La lista manda cuando la hay: una lista no admite ni foto ni botones, así
  // que la salida hacia Paula viaja como una fila más, la última.
  let archivado = reply;
  let sent;
  if (list && list.rows.length > 0) {
    salioConFoto = false;
    const cuerpo = formatBotReply(list.body);
    sent = await sendWhatsAppListMessage(phone, cuerpo, {
      button: PRODUCT_TEMPLATES["list.button"](),
      section: PRODUCT_TEMPLATES["list.section"](),
      footer: PRODUCT_TEMPLATES["list.footer"](),
      rows: [...list.rows, buildOwnerRow()],
    });
    if (sent.ok) {
      // En el panel tiene que verse lo que se le ofreció, no solo la frase.
      archivado = [cuerpo, ...list.rows.map((r) => `• ${r.description ?? r.title}`)].join("\n");
    } else {
      // Si Meta la rechaza se manda la versión escrita de siempre, que lleva
      // las mismas opciones y el botón de Paula. Perder la lista es un
      // detalle; dejar a la clienta sin respuesta, no.
      console.warn("[WHATSAPP_BOT] La lista no salió; se manda el texto", {
        conversationId,
        error: sent.error,
      });
      sent = await sendWhatsAppButtonMessage(phone, reply, conBotones);
    }
  } else {
    sent = photo
      ? await sendWhatsAppImageButtonMessage(phone, reply, conBotones, photo)
      : await sendWhatsAppButtonMessage(phone, reply, conBotones);
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
    sent = await sendWhatsAppButtonMessage(phone, reply, conBotones);
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
      ...(shown && shown.ids.length > 0
        ? { metadata: { shown } as unknown as Prisma.InputJsonValue }
        : {}),
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
