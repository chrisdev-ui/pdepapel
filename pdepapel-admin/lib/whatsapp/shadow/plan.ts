import { BOT_MAX_MESSAGES_PER_INBOUND, BOT_MAX_MESSAGES_PER_WINDOW } from "@/lib/whatsapp/bot-guards";
import type { BotIntent } from "@/lib/whatsapp/shadow/intent";

/**
 * Qué habría mandado el bot nuevo (el de edb9541a con las reglas que se
 * enviarían hoy), sin E/S: todo llega en el contexto. Las reglas que cambian
 * frente a edb9541a:
 * - el enlace al catálogo solo sale cuando preguntan qué venden, una vez por
 *   conversación; nunca detrás de la bienvenida, de una lista de productos ni
 *   de un «Esa no me la sé»;
 * - la bienvenida, una vez cada 24 h;
 * - como mucho 2 mensajes por mensaje de la clienta y 4 cada 10 minutos;
 * - los frenos de seguridad (interruptor, Paula activa, algo más nuevo de la
 *   clienta o de Paula) se miran antes de clasificar;
 * - el «sí» a un producto ofrecido, lo que suma al pedido ya pasado y la
 *   pregunta por el envío se deciden con reglas fijas, antes del clasificador.
 */
export const SHADOW_MESSAGE_TYPES = [
  "welcome",
  "product_list",
  "catalog_link",
  "casual_text",
  "fact",
  "keyword",
  "handoff",
  "order_request",
  "order_append",
  "shipping_quote",
  "web_welcome",
  "web_product",
] as const;
export type ShadowMessageType = (typeof SHADOW_MESSAGE_TYPES)[number];

export type ShadowSkipReason =
  | "bot_disabled"
  | "owner_active"
  | "pending_owner"
  | "superseded"
  | "needs_owner"
  | "welcome_repeat"
  | "acknowledgement"
  | "cap_per_window";

const CASUAL_INTENTS: BotIntent[] = ["thanks", "goodbye", "bot_identity", "catalog_question"];

export interface ShadowContext {
  botEnabled: boolean;
  ownerActive: boolean;
  /** Ya hay un mensaje más nuevo de la clienta archivado. */
  newerInbound: boolean;
  /** Lo que espera en la fila del webhook para esta clienta. */
  pending: "customer_message" | "owner_message" | null;
  /** La conversación ya esperaba a Paula cuando llegó este mensaje. */
  waitingForPaula: boolean;
  ownerEverWrote: boolean;
  /** El último mensaje del bot antes de este fue su propio «Esa no me la sé». */
  lastBotWasNoMatch: boolean;
  firstMessage: boolean;
  emojiOnly: boolean;
  welcomeRecently: boolean;
  catalogLinkBefore: boolean;
  factsApproved: boolean;
  productsApproved: boolean;
  casualApproved: boolean;
  businessFact: boolean;
  welcomeGreeting: boolean;
  keywordMatch: boolean;
  looksLikeProduct: boolean;
  /** Mensajes que la sombra ya planeó en esta conversación en los últimos 10 minutos. */
  recentPlannedMessages: number;
  /** «Sí» fresco a un producto que el bot ofreció con «¿Lo quieres?». */
  orderReply: boolean;
  /** Con el pedido ya en manos de Paula, suma un producto que se reconoce sin dudas. */
  orderAppend: boolean;
  /** Pregunta cuánto vale el envío. */
  shippingQuestion: boolean;
  /** Escribió con el texto de un botón de la tienda web y no agregó una pregunta. */
  webOrigin: "product" | "cart" | "order" | "general" | null;
  /** El producto de la referencia existe y tiene existencias. */
  webProductAvailable: boolean;
}

export interface ShadowSignals {
  intent: BotIntent | null;
  search: { ran: false } | { ran: true; found: boolean };
}

export interface ShadowPlan {
  types: ShadowMessageType[];
  skipReason: ShadowSkipReason | null;
}

/** Antes de gastar una llamada a OpenAI: si algo de esto aplica, el plan es silencio. */
export function shadowGuard(ctx: ShadowContext): ShadowSkipReason | null {
  if (!ctx.botEnabled) return "bot_disabled";
  if (ctx.ownerActive) return "owner_active";
  if (ctx.pending === "owner_message") return "pending_owner";
  if (ctx.newerInbound || ctx.pending === "customer_message") return "superseded";
  if (ctx.waitingForPaula && !ctx.orderAppend && (ctx.ownerEverWrote || !ctx.lastBotWasNoMatch)) return "needs_owner";
  return null;
}

/** ¿Hace falta buscar productos con lo que entendió el clasificador? */
export function shadowWantsSearch(ctx: ShadowContext, intent: BotIntent | null): boolean {
  if (!ctx.productsApproved) return false;
  return intent ? intent === "product" : ctx.looksLikeProduct;
}

const silence = (reason: ShadowSkipReason): ShadowPlan => ({ types: [], skipReason: reason });

export function planShadowReply(ctx: ShadowContext, signals: ShadowSignals): ShadowPlan {
  const guard = shadowGuard(ctx);
  if (guard) return silence(guard);

  const send = (types: ShadowMessageType[]): ShadowPlan => {
    const capped = types.slice(0, BOT_MAX_MESSAGES_PER_INBOUND);
    if (ctx.recentPlannedMessages + capped.length > BOT_MAX_MESSAGES_PER_WINDOW) return silence("cap_per_window");
    return { types: capped, skipReason: null };
  };
  const welcome = (): ShadowPlan | null => {
    if (!ctx.factsApproved) return null;
    return ctx.welcomeRecently ? silence("welcome_repeat") : send(["welcome"]);
  };

  // Tras su propio «Esa no me la sé» (y sin Paula en la conversación) solo se
  // contestan preguntas de producto con respuesta; lo demás espera a Paula.
  const onlyProducts = ctx.waitingForPaula;
  const { intent } = signals;

  // Tienda web (lib/whatsapp/web-origin.ts): un solo mensaje según la página.
  if (ctx.webOrigin && !onlyProducts) {
    if (ctx.webOrigin === "order") return send(["web_welcome"]);
    if (ctx.webOrigin === "product" && ctx.webProductAvailable) return send(["web_product"]);
    return ctx.welcomeRecently ? silence("welcome_repeat") : send(["web_welcome"]);
  }

  // Pedidos y envío (lib/whatsapp/bot-order-request.ts): reglas fijas, sin IA.
  if (ctx.orderAppend) return send(["order_append"]);
  if (ctx.orderReply && !onlyProducts) return send(["order_request"]);

  if (ctx.emojiOnly) {
    if (!onlyProducts && ctx.firstMessage) return welcome() ?? silence("acknowledgement");
    return silence(onlyProducts ? "needs_owner" : "acknowledgement");
  }

  if (!onlyProducts) {
    if (ctx.businessFact) return send(["fact"]);
    if (ctx.shippingQuestion) return send(["shipping_quote"]);
    if (ctx.welcomeGreeting || intent === "greeting") {
      const plan = welcome();
      if (plan) return plan;
    }
    if (intent === "acknowledgement") return silence("acknowledgement");
    if (intent === "escalate") return send(["handoff"]);
    if (intent && CASUAL_INTENTS.includes(intent) && ctx.casualApproved) {
      return send(intent === "catalog_question" && !ctx.catalogLinkBefore ? ["casual_text", "catalog_link"] : ["casual_text"]);
    }
    if (intent !== "product" && ctx.keywordMatch) return send(["keyword"]);
  }

  if (signals.search.ran) return send([signals.search.found ? "product_list" : "handoff"]);
  if (onlyProducts) return silence("needs_owner");
  if (ctx.keywordMatch) return send(["keyword"]);
  return send(["handoff"]);
}
