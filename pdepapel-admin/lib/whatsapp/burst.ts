import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
  type Prisma,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { classifyBusinessFact, isWelcomeGreeting } from "@/lib/whatsapp/bot-facts";
import { matchWhatsAppKeyword, normalizeBotText, type WhatsAppBotKeyword } from "@/lib/whatsapp/bot-matching";
import {
  isOfferFresh,
  isShippingCostQuestion,
  offeredProductId,
  parseAppendRequest,
  parseOrderReply,
} from "@/lib/whatsapp/bot-order-request";
import { looksLikeProductQuestion } from "@/lib/whatsapp/bot-products";
import { latestOrderRequest } from "@/lib/whatsapp/order-request-store";
import { detectWebOrigin, type WebOrigin } from "@/lib/whatsapp/web-origin";

/**
 * Modo ráfaga: una clienta parte una sola idea en varios mensajes («Hola» /
 * «¿tienes el cuaderno Norma?» / «es para mi hija»). Se juntan sus mensajes
 * seguidos y se elige qué contestar con una prioridad fija; luego el bot
 * sigue su camino de siempre con ese texto, así que no hay respuestas nuevas
 * ni se salta ninguna guarda.
 */
export const BURST_GAP_MS = 90_000;
export const BURST_MAX_MESSAGES = 6;
export const BURST_MAX_CHARS = 600;

export interface BurstRow {
  id: string;
  externalId: string | null;
  direction: ConversationMessageDirection;
  sentBy: ConversationMessageSentBy;
  body: string | null;
  mediaType: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

export interface BurstMessage {
  id: string;
  text: string;
  at: Date;
}

/** La edición de una clienta: qué mensaje cambia y su texto nuevo. */
export function readEdit(metadata: Prisma.JsonValue | null): { of: string; text: string } | null {
  const edit = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>).edit : null;
  if (!edit || typeof edit !== "object") return null;
  const { of, text } = edit as { of?: unknown; text?: unknown };
  return typeof of === "string" && typeof text === "string" && text.trim() ? { of, text } : null;
}

/**
 * Los mensajes de la clienta desde la última salida (del bot o de Paula) hasta
 * `currentId`, en orden. Corta si entre dos pasan más de 90 s; con la edición
 * más reciente de cada mensaje; los 6 últimos y, si pasan de 600 caracteres,
 * sin los más viejos. `rows` va en orden de llegada y termina en `currentId`.
 */
export function assembleBurst(rows: BurstRow[], currentId: string): BurstMessage[] {
  const end = rows.findIndex((row) => row.id === currentId);
  if (end === -1) return [];
  const chain: BurstRow[] = [];
  for (let index = end; index >= 0; index -= 1) {
    const row = rows[index];
    if (row.direction !== ConversationMessageDirection.INBOUND || row.sentBy !== ConversationMessageSentBy.CUSTOMER) break;
    const newer = chain.at(-1);
    if (newer && newer.createdAt.getTime() - row.createdAt.getTime() > BURST_GAP_MS) break;
    chain.push(row);
  }
  chain.reverse();

  const edits = new Map<string, string>();
  for (const row of chain) {
    const edit = readEdit(row.metadata);
    if (edit) edits.set(edit.of, edit.text);
  }
  const messages = chain
    .filter((row) => !readEdit(row.metadata) && !row.mediaType && row.body?.trim())
    .map((row) => ({ id: row.id, text: (row.externalId && edits.get(row.externalId)) || row.body!.trim(), at: row.createdAt }));
  // Una edición cuyo original quedó antes de la ráfaga (o es lo único) no se lee.
  const recent = messages.slice(-BURST_MAX_MESSAGES);
  while (recent.length > 1 && recent.reduce((sum, message) => sum + message.text.length, 0) > BURST_MAX_CHARS) recent.shift();
  return recent;
}

export type BurstIntent = "order" | "product" | "fact" | "web" | "greeting" | "filler" | "other";

const PRIORITY: BurstIntent[] = ["order", "product", "fact", "web", "greeting", "other", "filler"];
const FILLER =
  /^(gracias|muchas gracias|mil gracias|ok|okey|okay|vale|listo|dale|bueno|perfecto|super|genial|si|bien|claro|ah ok|ya|es para mi \w+|es para un regalo|es un regalo|porfa|por favor|quedo atenta|quedo atento)$/;

export interface BurstContext {
  /** El bot ofreció un producto con «¿Lo quieres?» hace poco: un «sí» es pedido. */
  offerOpen: boolean;
  /** Hay un pedido del bot pendiente: «y también…» se le suma. */
  orderPending: boolean;
  keywords: WhatsAppBotKeyword[];
}

export function burstIntentOf(text: string, ctx: BurstContext): BurstIntent {
  if ((ctx.offerOpen && parseOrderReply(text)) || (ctx.orderPending && parseAppendRequest(text))) return "order";
  if (looksLikeProductQuestion(text)) return "product";
  if (isShippingCostQuestion(text) || classifyBusinessFact(text) || matchWhatsAppKeyword(text, ctx.keywords)) return "fact";
  if (detectWebOrigin(text)) return "web";
  if (isWelcomeGreeting(text)) return "greeting";
  const plain = normalizeBotText(text).replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
  return !plain || FILLER.test(plain) ? "filler" : "other";
}

export interface BurstChoice {
  /** El texto con el que sigue el bot. */
  text: string;
  intent: BurstIntent;
  /** Posición (desde 1) del primer mensaje elegido. */
  position: number;
  webOrigin: WebOrigin | null;
  intents: BurstIntent[];
}

/**
 * Pedido > productos > datos del negocio y respuestas de Paula > botón de la
 * tienda web > saludo. Un pedido junta el «sí» con lo que le sigue («y
 * también 2 lapiceros»), como si viniera en un mensaje; varias preguntas de
 * productos se juntan igual. Sin nada reconocible, sigue con el último
 * mensaje que no sea relleno: el bot hace con él lo de siempre.
 */
export function chooseFromBurst(messages: BurstMessage[], ctx: BurstContext): BurstChoice | null {
  if (!messages.length) return null;
  const intents = messages.map((message) => burstIntentOf(message.text, ctx));
  const top = PRIORITY.find((intent) => intents.includes(intent))!;
  const first = intents.indexOf(top);
  const pick = (indexes: number[]): BurstChoice => ({
    text: indexes.map((index) => messages[index].text).join(" "),
    intent: top,
    position: indexes[0] + 1,
    webOrigin: top === "web" ? detectWebOrigin(messages[indexes[0]].text) : null,
    intents,
  });
  if (top === "order") {
    const appended = intents.map((intent, index) => index).filter((index) => index > first && Boolean(parseAppendRequest(messages[index].text)));
    return pick([first, ...appended]);
  }
  if (top === "product") return pick(intents.map((intent, index) => (intent === "product" ? index : -1)).filter((index) => index >= 0));
  if (top === "filler") return pick([messages.length - 1]);
  if (top === "other") return pick([intents.lastIndexOf("other")]);
  return pick([first]);
}

/** Lo que el texto elegido cambia frente a contestar solo el último mensaje. */
export function burstDiffers(messages: BurstMessage[], choice: BurstChoice): boolean {
  return choice.text !== messages.at(-1)?.text;
}

/** Filas de la conversación hasta `until` (incluida) para armar la ráfaga. */
export async function loadBurstRows(conversationId: string, until: Date): Promise<BurstRow[]> {
  const rows = await prismadb.conversationMessage.findMany({
    where: { conversationId, createdAt: { lte: until } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 40,
    select: { id: true, externalId: true, direction: true, sentBy: true, body: true, mediaType: true, metadata: true, createdAt: true },
  });
  return rows.reverse();
}

export async function loadBurstContext(conversationId: string, burstStart: Date, at: Date, keywords: WhatsAppBotKeyword[]): Promise<BurstContext> {
  const [offer, latest] = await Promise.all([
    prismadb.conversationMessage.findFirst({
      where: {
        conversationId,
        direction: ConversationMessageDirection.OUTBOUND,
        sentBy: ConversationMessageSentBy.BOT,
        status: { not: ConversationMessageStatus.FAILED },
        createdAt: { lt: burstStart },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, metadata: true, createdAt: true },
    }),
    latestOrderRequest(conversationId, at),
  ]);
  return {
    offerOpen: Boolean(offer && offeredProductId(offer) && isOfferFresh(offer.createdAt, at)),
    orderPending: Boolean(latest?.fromBot && latest.record.status === "pending" && offer && latest.id === offer.id && isOfferFresh(offer.createdAt, at)),
    keywords,
  };
}

/** Lo que se guarda en el modo sombra: tamaños, posición e intenciones; nunca texto. */
export function describeBurst(messages: BurstMessage[], choice: BurstChoice | null, mode: "shadow" | "applied") {
  return {
    mode,
    size: messages.length,
    chars: messages.reduce((sum, message) => sum + message.text.length, 0),
    chosenIntent: choice?.intent ?? null,
    chosenPosition: choice?.position ?? null,
    lastIntent: choice?.intents.at(-1) ?? null,
    intents: choice?.intents ?? [],
    differs: Boolean(choice && burstDiffers(messages, choice)),
  };
}

/**
 * Una sola corrida contesta la ráfaga: se marca su último mensaje en una sola
 * sentencia (un `updateMany` con guarda se compila en SELECT + UPDATE y dos
 * corridas se quedarían las dos con ella; ver lib/atomic-claim.ts).
 */
export async function claimBurst(messageId: string, claim: string): Promise<boolean> {
  const affected = await prismadb.$executeRaw`
    UPDATE \`ConversationMessage\`
       SET \`metadata\` = JSON_SET(COALESCE(\`metadata\`, JSON_OBJECT()), '$.burstClaim', ${claim})
     WHERE \`id\` = ${messageId}
       AND JSON_EXTRACT(COALESCE(\`metadata\`, JSON_OBJECT()), '$.burstClaim') IS NULL`;
  return affected === 1;
}
