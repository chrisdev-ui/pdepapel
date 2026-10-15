import { isFillerText } from "@/lib/whatsapp/filler";

/**
 * «Esperando a Paula» y lo que el bot puede hacer mientras tanto, como
 * funciones puras: sin Prisma ni envíos, para poder probar cada regla con una
 * tabla. La parte con base de datos y cola vive en `wait-assist.ts`.
 *
 * Una espera empieza con el primer mensaje de verdad de la clienta después de
 * lo último que salió (de Paula o del bot) y termina con la siguiente salida.
 * «ok», «gracias», reacciones y ediciones no abren una espera.
 */
export const WAITING_BADGE_AFTER_MS = 15 * 60 * 1000;
export const FALLBACK_AFTER_MS = 10 * 60 * 1000;
export const HOLDING_AFTER_MS = 15 * 60 * 1000;
export const REMINDER_AFTER_MS = 30 * 60 * 1000;
/** Paula no quiere el correo de «clientas esperando» (2026-10-15): apagado hasta que haya un interruptor en Ajustes. */
export const WAITING_REMINDER_EMAIL_ENABLED = false;
/** El correo cuenta solo esperas de menos de un día: las viejas siguen en la lista, pero no mandan un correo cada hora. */
export const REMINDER_MAX_WAIT_MS = 24 * 60 * 60 * 1000;
/** Meta deja escribir 24 h después del último mensaje de la clienta; se deja margen. */
export const CUSTOMER_WINDOW_SAFE_MS = 23 * 60 * 60 * 1000;
/** «Conversación en vivo»: Paula mandó al menos 3 mensajes en los últimos 30 min. */
export const LIVE_CHAT_WINDOW_MS = 30 * 60 * 1000;
export const LIVE_CHAT_OWNER_MESSAGES = 3;
/** Como mucho tantos mensajes del bot por espera, sumando respuesta y mensaje de espera. */
export const MAX_ASSIST_SENDS_PER_WAIT = 2;

export type AssistMode = "OFF" | "SHADOW" | "ON";
export type AssistKind = "fallback" | "holding";
/** Lo que el bot sabe contestar bien; lo demás espera a Paula. */
export type AssistIntent = "fact" | "product" | "order" | "web";

export interface WaitMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  sentBy: "CUSTOMER" | "OWNER" | "BOT";
  body: string | null;
  mediaType: string | null;
  createdAt: Date;
  /** Marcas del mensaje que importan aquí: edición y aviso de que Paula escribe. */
  edit?: boolean;
  handoff?: boolean;
}

/** Un mensaje de la clienta que pide respuesta: no reacción, no edición, no «ok/gracias». Una foto o un audio sí. */
export function isRealCustomerMessage(message: WaitMessage): boolean {
  if (message.sentBy !== "CUSTOMER" || message.direction !== "INBOUND") return false;
  if (message.mediaType === "reaction" || message.edit) return false;
  if (message.mediaType && !message.body?.trim()) return true;
  return !isFillerText(message.body);
}

export interface Wait {
  /** Primer mensaje de verdad de la espera: la llave de la espera. */
  startMessageId: string;
  since: Date;
  /** Último mensaje de la clienta (de verdad o no). */
  lastCustomerAt: Date;
  lastCustomerMessageId: string;
  /** Lo de la clienta desde lo último que salió, en orden. */
  messages: WaitMessage[];
}

/** La espera abierta, o `null` si lo último que pasó fue una salida o la clienta solo dijo «ok». `messages` en orden de llegada. */
export function currentWait(messages: readonly WaitMessage[]): Wait | null {
  let lastOut = -1;
  messages.forEach((message, index) => {
    if (message.direction === "OUTBOUND") lastOut = index;
  });
  const after = messages.slice(lastOut + 1).filter((message) => message.direction === "INBOUND" && message.sentBy === "CUSTOMER");
  const first = after.find(isRealCustomerMessage);
  if (!first) return null;
  const last = after[after.length - 1];
  return { startMessageId: first.id, since: first.createdAt, lastCustomerAt: last.createdAt, lastCustomerMessageId: last.id, messages: after };
}

/** ¿Lleva más de 15 min esperando? Es lo que pinta la insignia y cuenta la lista. */
export function isWaitingOnPaula(wait: Wait | null, now: Date): boolean {
  return Boolean(wait && now.getTime() - wait.since.getTime() >= WAITING_BADGE_AFTER_MS);
}

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Hora de Bogotá (0–23); Colombia no tiene horario de verano. */
export const bogotaHour = (now: Date) => new Date(now.getTime() - BOGOTA_OFFSET_MS).getUTCHours();
/** 00:00–06:59: el mensaje de espera sale enseguida y con el texto de noche. */
export const isNight = (now: Date) => bogotaHour(now) < 7;
/** 08:00–22:59: horas del correo de recordatorio. */
export const isReminderHours = (now: Date) => {
  const hour = bogotaHour(now);
  return hour >= 8 && hour <= 22;
};

export interface AssistContext {
  mode: AssistMode;
  /** Interruptor general del bot. */
  botEnabled: boolean;
  now: Date;
  wait: Wait;
  /** ¿Paula, el bot u otra salida escribió después de que empezó la espera? */
  outboundSinceWaitStart: boolean;
  /** Mensajes del bot que ya salieron en esta espera por este camino (respuesta o espera). */
  assistSendsThisWait: number;
  /** ¿Ya hubo en esta espera un aviso de que Paula escribe? */
  handoffNoticeThisWait: boolean;
}

export type AssistDecision =
  | { decision: "send" | "would_send"; reason: null; intent?: AssistIntent }
  | { decision: "skip"; reason: AssistSkipReason; intent?: AssistIntent | null };

export type AssistSkipReason =
  | "mode_off"
  | "bot_disabled"
  | "answered"
  | "not_latest"
  | "too_early"
  | "outside_customer_window"
  | "send_cap"
  | "not_recognized"
  | "live_chat_facts_only"
  | "already_promised"
  | "empty_text"
  | "filler_only";

/** Lo común a la respuesta y al mensaje de espera. `null` si se puede seguir. */
function commonGuard(ctx: AssistContext): AssistSkipReason | null {
  if (ctx.mode === "OFF") return "mode_off";
  if (!ctx.botEnabled) return "bot_disabled";
  if (ctx.outboundSinceWaitStart) return "answered";
  if (ctx.now.getTime() - ctx.wait.lastCustomerAt.getTime() > CUSTOMER_WINDOW_SAFE_MS) return "outside_customer_window";
  if (ctx.assistSendsThisWait >= MAX_ASSIST_SENDS_PER_WAIT) return "send_cap";
  return null;
}

const decided = (mode: AssistMode, intent?: AssistIntent): AssistDecision =>
  mode === "ON" ? { decision: "send", reason: null, intent } : { decision: "would_send", reason: null, intent };

/**
 * La respuesta del bot a los 10 min sin respuesta de nadie, para el mensaje
 * `messageId` (el último de la clienta cuando se programó). Solo lo que el
 * bot contesta bien; en una conversación en vivo o con un pedido abierto,
 * solo datos del negocio.
 */
export function decideFallback(
  ctx: AssistContext & { messageId: string; intent: AssistIntent | null; liveChat: boolean; openOrder: boolean },
): AssistDecision {
  const guard = commonGuard(ctx);
  if (guard) return { decision: "skip", reason: guard, intent: ctx.intent };
  if (ctx.messageId !== ctx.wait.lastCustomerMessageId) return { decision: "skip", reason: "not_latest", intent: ctx.intent };
  if (ctx.now.getTime() - ctx.wait.lastCustomerAt.getTime() < FALLBACK_AFTER_MS) return { decision: "skip", reason: "too_early", intent: ctx.intent };
  if (!ctx.intent) return { decision: "skip", reason: "not_recognized", intent: null };
  if ((ctx.liveChat || ctx.openOrder) && ctx.intent !== "fact") return { decision: "skip", reason: "live_chat_facts_only", intent: ctx.intent };
  return decided(ctx.mode, ctx.intent);
}

/**
 * El mensaje de espera, una vez por espera: a los 15 min de día, enseguida de
 * noche. Sin texto no sale nunca; en modo sombra se anota igual lo que habría
 * hecho, para poder comparar con la simulación antes de que Paula lo escriba.
 */
export function decideHolding(ctx: AssistContext & { text: string | null }): AssistDecision {
  const guard = commonGuard(ctx);
  if (guard) return { decision: "skip", reason: guard };
  if (ctx.handoffNoticeThisWait) return { decision: "skip", reason: "already_promised" };
  if (!ctx.wait.messages.some(isRealCustomerMessage)) return { decision: "skip", reason: "filler_only" };
  if (!isNight(ctx.now) && ctx.now.getTime() - ctx.wait.since.getTime() < HOLDING_AFTER_MS) return { decision: "skip", reason: "too_early" };
  if (ctx.mode === "ON" && !ctx.text?.trim()) return { decision: "skip", reason: "empty_text" };
  return decided(ctx.mode);
}

/** Cuándo correr la revisión del mensaje de espera para una espera que empieza `since`. */
export function holdingDueAt(since: Date): Date {
  return isNight(since) ? since : new Date(since.getTime() + HOLDING_AFTER_MS);
}

const PANEL_ORIGIN = "https://admin.papeleriapdepapel.com";

/** El correo de recordatorio: solo la cuenta y el enlace a la lista filtrada; ni nombres, ni teléfonos, ni texto. */
export function waitingReminderEmail(input: { storeId: string; count: number }) {
  const link = `${PANEL_ORIGIN}/${input.storeId}/conversaciones?esperando=1`;
  const subject = input.count === 1 ? "Una clienta te espera en WhatsApp" : `${input.count} clientas te esperan en WhatsApp`;
  const text =
    `${input.count === 1 ? "Hay 1 conversación" : `Hay ${input.count} conversaciones`} en las que la clienta escribió hace más de 30 minutos (en las últimas 24 horas) y nadie le ha respondido.\n\n` +
    `Ver «Esperando a Paula»: ${link}\n\n` +
    "Este recordatorio sale como mucho una vez por hora, de 8 a. m. a 11 p. m.";
  return { subject, text };
}
