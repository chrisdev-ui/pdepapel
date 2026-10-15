import { describe, expect, it } from "vitest";

import { formatWaitingFor } from "@/lib/conversation-bot-pause";
import { isFillerText } from "@/lib/whatsapp/filler";
import { summarizeWaitDecisions } from "@/lib/whatsapp/wait-report";
import {
  CUSTOMER_WINDOW_SAFE_MS,
  FALLBACK_AFTER_MS,
  HOLDING_AFTER_MS,
  bogotaHour,
  currentWait,
  decideFallback,
  decideHolding,
  holdingDueAt,
  isNight,
  isReminderHours,
  isWaitingOnPaula,
  type AssistMode,
  type Wait,
  type WaitMessage,
  waitingReminderEmail,
} from "@/lib/whatsapp/waiting";

/** 2026-10-14 15:00 Bogotá = 20:00 UTC. */
const DAY = new Date("2026-10-14T20:00:00Z");
/** 2026-10-14 02:00 Bogotá = 07:00 UTC. */
const NIGHT = new Date("2026-10-14T07:00:00Z");
const MIN = 60 * 1000;
const ago = (now: Date, minutes: number) => new Date(now.getTime() - minutes * MIN);

let seq = 0;
const msg = (overrides: Partial<WaitMessage> & Pick<WaitMessage, "createdAt">): WaitMessage => ({
  id: `m${++seq}`,
  direction: "INBOUND",
  sentBy: "CUSTOMER",
  body: "¿tienen cuadernos argollados?",
  mediaType: null,
  ...overrides,
});
const out = (createdAt: Date, sentBy: "OWNER" | "BOT" = "OWNER") => msg({ direction: "OUTBOUND", sentBy, body: "listo", createdAt });

describe("la espera", () => {
  it("empieza con el primer mensaje de verdad después de la última salida", () => {
    const question = msg({ createdAt: ago(DAY, 20) });
    const wait = currentWait([out(ago(DAY, 30)), msg({ body: "ok", createdAt: ago(DAY, 25) }), question, msg({ body: "gracias", createdAt: ago(DAY, 5) })]);
    expect(wait).toMatchObject({ startMessageId: question.id, since: question.createdAt, lastCustomerAt: ago(DAY, 5) });
  });

  it("«ok», «gracias», una reacción o una edición solas no abren una espera; una foto o un audio sí", () => {
    expect(currentWait([out(ago(DAY, 30)), msg({ body: "Gracias!!", createdAt: ago(DAY, 20) })])).toBeNull();
    expect(currentWait([msg({ body: null, mediaType: "reaction", createdAt: ago(DAY, 20) })])).toBeNull();
    expect(currentWait([msg({ body: null, edit: true, createdAt: ago(DAY, 20) })])).toBeNull();
    expect(currentWait([msg({ body: null, mediaType: "audio", createdAt: ago(DAY, 20) })])).not.toBeNull();
    expect(currentWait([msg({ body: null, mediaType: "image", createdAt: ago(DAY, 20) })])).not.toBeNull();
  });

  it("la cierra cualquier salida de Paula o del bot", () => {
    expect(currentWait([msg({ createdAt: ago(DAY, 20) }), out(ago(DAY, 10))])).toBeNull();
    expect(currentWait([msg({ createdAt: ago(DAY, 20) }), out(ago(DAY, 10), "BOT")])).toBeNull();
  });

  it("la insignia sale a los 15 min, no antes", () => {
    const wait = currentWait([msg({ createdAt: ago(DAY, 14) })]);
    expect(isWaitingOnPaula(wait, DAY)).toBe(false);
    expect(isWaitingOnPaula(wait, new Date(DAY.getTime() + MIN))).toBe(true);
    expect(isWaitingOnPaula(null, DAY)).toBe(false);
  });

  it("«ok/gracias» es relleno; una pregunta no", () => {
    expect(["ok", "Gracias 💛", "listo!", "muchas gracias", "👍", "Perfecto"].every(isFillerText)).toBe(true);
    expect(["ok gracias", "Listo, mil gracias!", "gracias por la info", "Sí claro"].every(isFillerText)).toBe(true);
    expect(isFillerText("ok y tienen agendas?")).toBe(false);
  });

  it("cuenta el tiempo esperando en minutos, horas y días", () => {
    expect(formatWaitingFor(ago(DAY, 23), DAY)).toBe("Esperando a Paula · 23 min");
    expect(formatWaitingFor(ago(DAY, 130), DAY)).toBe("Esperando a Paula · 2 h");
    expect(formatWaitingFor(ago(DAY, 60 * 49), DAY)).toBe("Esperando a Paula · 2 días");
  });
});

describe("horas de Bogotá", () => {
  it("noche es de 00:00 a 06:59; el correo, de 08:00 a 22:59", () => {
    expect(bogotaHour(NIGHT)).toBe(2);
    expect(isNight(new Date("2026-10-14T05:00:00Z"))).toBe(true); // 00:00
    expect(isNight(new Date("2026-10-14T11:59:00Z"))).toBe(true); // 06:59
    expect(isNight(new Date("2026-10-14T12:00:00Z"))).toBe(false); // 07:00
    expect(isReminderHours(new Date("2026-10-14T12:59:00Z"))).toBe(false); // 07:59
    expect(isReminderHours(new Date("2026-10-14T13:00:00Z"))).toBe(true); // 08:00
    expect(isReminderHours(new Date("2026-10-15T03:59:00Z"))).toBe(true); // 22:59
    expect(isReminderHours(new Date("2026-10-15T04:00:00Z"))).toBe(false); // 23:00
  });

  it("el mensaje de espera se revisa a los 15 min de día y enseguida de noche", () => {
    expect(holdingDueAt(DAY).getTime()).toBe(DAY.getTime() + HOLDING_AFTER_MS);
    expect(holdingDueAt(NIGHT)).toEqual(NIGHT);
  });
});

const waitAt = (now: Date, minutesAgo: number, lastMinutesAgo = minutesAgo): Wait => {
  const first = msg({ createdAt: ago(now, minutesAgo) });
  const last = lastMinutesAgo === minutesAgo ? first : msg({ createdAt: ago(now, lastMinutesAgo) });
  return currentWait(last === first ? [first] : [first, last])!;
};
const base = (now: Date, wait: Wait, mode: AssistMode = "SHADOW") => ({
  mode,
  botEnabled: true,
  now,
  wait,
  outboundSinceWaitStart: false,
  assistSendsThisWait: 0,
  handoffNoticeThisWait: false,
});

describe("respuesta a los 10 min", () => {
  const fallback = (overrides: Partial<Parameters<typeof decideFallback>[0]> = {}, mode: AssistMode = "SHADOW") => {
    const wait = waitAt(DAY, 12);
    return decideFallback({ ...base(DAY, wait, mode), messageId: wait.lastCustomerMessageId, intent: "fact", liveChat: false, openOrder: false, ...overrides });
  };

  it("en sombra anota que habría contestado; encendida contesta; apagada nada", () => {
    expect(fallback()).toEqual({ decision: "would_send", reason: null, intent: "fact" });
    expect(fallback({}, "ON")).toEqual({ decision: "send", reason: null, intent: "fact" });
    expect(fallback({}, "OFF")).toMatchObject({ decision: "skip", reason: "mode_off" });
  });

  it("solo lo que el bot contesta bien; en una conversación en vivo o con pedido abierto, solo datos del negocio", () => {
    expect(fallback({ intent: null })).toMatchObject({ decision: "skip", reason: "not_recognized" });
    expect(fallback({ intent: "product", liveChat: true })).toMatchObject({ decision: "skip", reason: "live_chat_facts_only" });
    expect(fallback({ intent: "order", openOrder: true })).toMatchObject({ decision: "skip", reason: "live_chat_facts_only" });
    expect(fallback({ intent: "fact", liveChat: true })).toMatchObject({ decision: "would_send" });
    expect(fallback({ intent: "product" })).toMatchObject({ decision: "would_send", intent: "product" });
  });

  it("se cancela si alguien ya contestó, si la clienta escribió hace menos de 10 min o si el mensaje ya no es el último", () => {
    expect(fallback({ outboundSinceWaitStart: true })).toMatchObject({ reason: "answered" });
    const recent = waitAt(DAY, 12, 4);
    expect(decideFallback({ ...base(DAY, recent), messageId: recent.lastCustomerMessageId, intent: "fact", liveChat: false, openOrder: false })).toMatchObject({ reason: "too_early" });
    expect(fallback({ messageId: "otro" })).toMatchObject({ reason: "not_latest" });
    expect(FALLBACK_AFTER_MS).toBe(10 * MIN);
  });

  it("interruptor general apagado, fuera de la ventana de 24 h de Meta o con el tope de envíos: nada", () => {
    expect(fallback({ botEnabled: false })).toMatchObject({ reason: "bot_disabled" });
    const old = waitAt(DAY, 23 * 60 + 5);
    expect(decideFallback({ ...base(DAY, old), messageId: old.lastCustomerMessageId, intent: "fact", liveChat: false, openOrder: false })).toMatchObject({ reason: "outside_customer_window" });
    expect(CUSTOMER_WINDOW_SAFE_MS).toBe(23 * 60 * MIN);
    expect(fallback({ assistSendsThisWait: 2 })).toMatchObject({ reason: "send_cap" });
  });
});

describe("mensaje de espera", () => {
  const holding = (now: Date, minutesAgo: number, overrides: Partial<Parameters<typeof decideHolding>[0]> = {}, mode: AssistMode = "SHADOW") =>
    decideHolding({ ...base(now, waitAt(now, minutesAgo), mode), text: "Paula ya vio tu mensaje", ...overrides });

  it("de día a los 15 min; de noche enseguida", () => {
    expect(holding(DAY, 14)).toMatchObject({ decision: "skip", reason: "too_early" });
    expect(holding(DAY, 15)).toEqual({ decision: "would_send", reason: null });
    expect(holding(NIGHT, 0)).toEqual({ decision: "would_send", reason: null });
  });

  it("sin texto no sale nunca encendido; en sombra se anota igual para comparar", () => {
    expect(holding(DAY, 20, { text: "  " }, "ON")).toMatchObject({ decision: "skip", reason: "empty_text" });
    expect(holding(DAY, 20, { text: null }, "SHADOW")).toEqual({ decision: "would_send", reason: null });
    expect(holding(DAY, 20, {}, "ON")).toEqual({ decision: "send", reason: null });
  });

  it("nunca después de un aviso de que Paula escribe, nunca dos veces ni pasando el tope", () => {
    expect(holding(DAY, 20, { handoffNoticeThisWait: true })).toMatchObject({ reason: "already_promised" });
    expect(holding(DAY, 20, { assistSendsThisWait: 2 })).toMatchObject({ reason: "send_cap" });
    expect(holding(DAY, 20, { outboundSinceWaitStart: true })).toMatchObject({ reason: "answered" });
  });
});

describe("correo de recordatorio", () => {
  it("solo la cuenta y el enlace filtrado; nada de la clienta", () => {
    const { subject, text } = waitingReminderEmail({ storeId: "store-1", count: 3 });
    expect(subject).toBe("3 clientas te esperan en WhatsApp");
    expect(text).toContain("Hay 3 conversaciones");
    expect(text).toContain("/store-1/conversaciones?esperando=1");
    expect(waitingReminderEmail({ storeId: "s", count: 1 }).subject).toBe("Una clienta te espera en WhatsApp");
  });
});

describe("informe del modo sombra", () => {
  it("cuenta decisiones, motivos, intenciones y si Paula escribió cerca", () => {
    const at = DAY;
    const report = summarizeWaitDecisions(
      [
        { conversationId: "c1", kind: "fallback", decision: "would_send", reason: null, intent: "fact", night: false, decidedAt: at },
        { conversationId: "c2", kind: "fallback", decision: "skip", reason: "not_recognized", intent: null, night: false, decidedAt: at },
        { conversationId: "c3", kind: "holding", decision: "would_send", reason: null, intent: null, night: true, decidedAt: at },
      ],
      [
        { conversationId: "c1", createdAt: new Date(at.getTime() + 1 * MIN) },
        { conversationId: "c3", createdAt: new Date(at.getTime() + 12 * MIN) },
      ],
    );
    expect(report.fallback).toMatchObject({ wouldSend: 1, skipped: 1, reasons: [["not_recognized", 1]], intents: [["fact", 1]], ownerWithin: { 2: 1, 5: 1, 15: 1 } });
    expect(report.holding).toMatchObject({ wouldSend: 1, night: 1, ownerWithin: { 2: 0, 5: 0, 15: 1 } });
  });
});
