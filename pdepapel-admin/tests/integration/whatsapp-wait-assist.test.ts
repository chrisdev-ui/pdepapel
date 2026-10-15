import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Esperando a Paula» contra MySQL (lib/whatsapp/wait-assist.ts,
 * lib/whatsapp/waiting-list.ts): el turno único por espera, las
 * cancelaciones, el modo sombra que no manda nada, el tope de 23 h y el
 * mensaje de espera. WhatsApp, la cola y la corrida del bot se simulan y se
 * cuentan. Datos sintéticos.
 */
const sim = vi.hoisted(() => ({ sent: [] as string[], queued: [] as { kind: string; dedup: string; delay: number }[], botRuns: [] as unknown[] }));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  return {
    ...actual,
    sendWhatsAppTextMessage: async (_to: string, body: string) => {
      sim.sent.push(body);
      return { ok: true, externalId: `wamid.sim-${randomUUID()}` };
    },
  };
});
vi.mock("@/lib/whatsapp/queue", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/queue");
  return {
    ...actual,
    enqueueWhatsAppWaitCheck: async (check: { kind: string }, _key: string | null, delay: number, dedup: string) => {
      sim.queued.push({ kind: check.kind, dedup, delay });
      return true;
    },
  };
});
vi.mock("@/lib/whatsapp/bot", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/bot");
  return {
    ...actual,
    runWhatsAppBot: async (input: unknown) => {
      sim.botRuns.push(input);
      return { outcome: "replied" };
    },
  };
});

const MIN = 60 * 1000;
/** 2026-10-14 15:00 Bogotá. */
const DAY = new Date("2026-10-14T20:00:00Z");
/** 2026-10-14 02:00 Bogotá. */
const NIGHT = new Date("2026-10-14T07:00:00Z");
const ago = (now: Date, minutes: number) => new Date(now.getTime() - minutes * MIN);

let fixture: InventoryFixture;
let store = "";
let phoneSeq = 0;

async function settings(data: { botFallbackMode?: "OFF" | "SHADOW" | "ON"; botHoldingMode?: "OFF" | "SHADOW" | "ON"; botHoldingText?: string | null; botHoldingNightText?: string | null }) {
  await testPrisma.storeSettings.upsert({
    where: { storeId: store },
    create: { storeId: store, botEnabled: true, botFallbackMode: "SHADOW", botHoldingMode: "SHADOW", ...data },
    update: { botEnabled: true, botFallbackMode: "SHADOW", botHoldingMode: "SHADOW", botHoldingText: null, botHoldingNightText: null, ...data },
  });
}

/** Una conversación con Paula hace `ownerAgo` min y luego lo que se pase. */
async function conversation(messages: { sentBy: "CUSTOMER" | "OWNER" | "BOT"; at: Date; body?: string | null; mediaType?: string | null; metadata?: object }[]) {
  const conversation = await testPrisma.conversation.create({
    data: { storeId: store, phone: `30000000${String(++phoneSeq).padStart(2, "0")}`, status: "NEEDS_OWNER", needsOwnerReason: "owner_window", lastOwnerAt: messages.filter((m) => m.sentBy === "OWNER").at(-1)?.at ?? null },
  });
  const ids: string[] = [];
  for (const message of messages) {
    const row = await testPrisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: message.sentBy === "CUSTOMER" ? "INBOUND" : "OUTBOUND",
        sentBy: message.sentBy,
        body: message.body === undefined ? (message.sentBy === "CUSTOMER" ? "¿a qué hora abren hoy?" : "ya te ayudo") : message.body,
        mediaType: message.mediaType ?? null,
        externalId: `wamid.${randomUUID()}`,
        status: message.sentBy === "CUSTOMER" ? "RECEIVED" : "SENT",
        createdAt: message.at,
        ...(message.metadata ? { metadata: message.metadata } : {}),
      },
    });
    ids.push(row.id);
  }
  const inbound = messages.filter((m) => m.sentBy === "CUSTOMER").at(-1)?.at ?? null;
  const outbound = messages.filter((m) => m.sentBy !== "CUSTOMER").at(-1)?.at ?? null;
  await testPrisma.conversation.update({ where: { id: conversation.id }, data: { lastInboundAt: inbound, lastOutboundAt: outbound } });
  return { id: conversation.id, ids };
}

const decisions = (conversationId: string) => testPrisma.whatsAppWaitDecision.findMany({ where: { conversationId } });

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  store = fixture.store.id;
});

beforeEach(async () => {
  sim.sent.length = 0;
  sim.queued.length = 0;
  sim.botRuns.length = 0;
  await settings({});
});

afterAll(async () => {
  const conversations = (await testPrisma.conversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await testPrisma.whatsAppWaitDecision.deleteMany({ where: { storeId: store } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: store } });
  await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
  await deleteInventoryFixture(fixture);
  await testPrisma.$disconnect();
});

describe("respuesta a los 10 min", () => {
  it("dos corridas a la vez: una sola decide (la llave única es el turno) y en sombra no sale nada", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 12) }]);
    const check = { conversationId: chat.id, messageId: chat.ids[1], kind: "fallback" as const };
    const results = await Promise.all([runWaitCheck(check, DAY), runWaitCheck(check, DAY)]);
    expect(results.map((r) => r.decision).sort()).toEqual(["claimed_elsewhere", "would_send"]);
    expect(await decisions(chat.id)).toEqual([expect.objectContaining({ kind: "fallback", mode: "SHADOW", decision: "would_send", intent: "fact", turnMessageId: chat.ids[1] })]);
    expect(sim.botRuns).toHaveLength(0);
    expect(sim.sent).toHaveLength(0);
    expect(await testPrisma.conversationMessage.count({ where: { conversationId: chat.id } })).toBe(2);
  });

  it("una corrida vieja (Paula o el bot ya contestaron) sale sin escribir nada", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    for (const answeredBy of ["OWNER", "BOT"] as const) {
      const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 12) }, { sentBy: answeredBy, at: ago(DAY, 3) }]);
      await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "fallback" }, DAY)).resolves.toEqual({ kind: "fallback", decision: "no_wait" });
      await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "holding" }, DAY)).resolves.toEqual({ kind: "holding", decision: "no_wait" });
      expect(await decisions(chat.id)).toEqual([]);
    }
  });

  it("si la clienta siguió escribiendo, no decide: se reprograma a 10 min de su último mensaje, una vez", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 12) }, { sentBy: "CUSTOMER", at: ago(DAY, 3), body: "y los domingos?" }]);
    await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "fallback" }, DAY)).resolves.toMatchObject({ decision: "skip", reason: "too_early" });
    expect(await decisions(chat.id)).toEqual([]);
    expect(sim.queued).toEqual([{ kind: "fallback", dedup: `wait-fallback-${chat.ids[1]}-${chat.ids[2]}`, delay: 7 * 60 }]);
  });

  it("en una conversación en vivo (Paula mandó 3 o más en 30 min) solo datos del negocio; encendida, el bot corre con la espera", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    await settings({ botFallbackMode: "ON" });
    const live = [ago(DAY, 28), ago(DAY, 26), ago(DAY, 24)].map((at) => ({ sentBy: "OWNER" as const, at }));
    const product = await conversation([...live, { sentBy: "CUSTOMER", at: ago(DAY, 12), body: "¿tienen cuadernos argollados de 100 hojas?" }]);
    await expect(runWaitCheck({ conversationId: product.id, messageId: product.ids[3], kind: "fallback" }, DAY)).resolves.toMatchObject({ decision: "skip", reason: "live_chat_facts_only" });
    expect(sim.botRuns).toHaveLength(0);

    const fact = await conversation([...live, { sentBy: "CUSTOMER", at: ago(DAY, 12), body: "¿a qué hora abren hoy?" }]);
    await expect(runWaitCheck({ conversationId: fact.id, messageId: fact.ids[3], kind: "fallback" }, DAY)).resolves.toMatchObject({ decision: "send" });
    expect(sim.botRuns).toEqual([expect.objectContaining({ conversationId: fact.id, assist: { waitStartedAt: ago(DAY, 12) } })]);
    expect(await decisions(fact.id)).toEqual([expect.objectContaining({ decision: "send", mode: "ON", outcome: "replied" })]);
  });

  it("pasadas 23 h desde el último mensaje de la clienta no se escribe (ventana de Meta)", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    await settings({ botFallbackMode: "ON" });
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 30 * 60) }, { sentBy: "CUSTOMER", at: ago(DAY, 23 * 60 + 5) }]);
    await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "fallback" }, DAY)).resolves.toMatchObject({ decision: "skip", reason: "outside_customer_window" });
    expect(sim.botRuns).toHaveLength(0);
  });
});

describe("mensaje de espera", () => {
  it("encendido y sin texto no sale; con texto sale una vez, marcado, y no cierra la espera", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    const { findWaitingConversations } = await import("@/lib/whatsapp/waiting-list");
    await settings({ botHoldingMode: "ON" });
    const empty = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 20) }]);
    await expect(runWaitCheck({ conversationId: empty.id, messageId: empty.ids[1], kind: "holding" }, DAY)).resolves.toMatchObject({ decision: "skip", reason: "empty_text" });
    expect(sim.sent).toHaveLength(0);

    await settings({ botHoldingMode: "ON", botHoldingText: "Paula ya vio tu mensaje y te responde en breve" });
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 20) }]);
    const check = { conversationId: chat.id, messageId: chat.ids[1], kind: "holding" as const };
    await expect(runWaitCheck(check, DAY)).resolves.toMatchObject({ decision: "send" });
    await expect(runWaitCheck(check, DAY)).resolves.toMatchObject({ decision: "claimed_elsewhere" });
    expect(sim.sent).toEqual(["Paula ya vio tu mensaje y te responde en breve"]);
    const holding = await testPrisma.conversationMessage.findFirst({ where: { conversationId: chat.id, sentBy: "BOT" } });
    expect(holding?.metadata).toEqual({ holding: true });
    // Sigue esperando a Paula: el mensaje de espera no es una respuesta.
    expect((await findWaitingConversations(store, DAY)).has(chat.id)).toBe(true);
  });

  it("de noche sale enseguida con el texto de noche; nunca tras «ok/gracias» solos", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    await settings({ botHoldingMode: "ON", botHoldingText: "de día", botHoldingNightText: "Paula responde desde las 7 a. m." });
    const chat = await conversation([{ sentBy: "OWNER", at: ago(NIGHT, 300) }, { sentBy: "CUSTOMER", at: ago(NIGHT, 1) }]);
    await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "holding" }, NIGHT)).resolves.toMatchObject({ decision: "send" });
    expect(sim.sent).toEqual(["Paula responde desde las 7 a. m."]);
    expect(await decisions(chat.id)).toEqual([expect.objectContaining({ night: true })]);

    const thanks = await conversation([{ sentBy: "OWNER", at: ago(NIGHT, 300) }, { sentBy: "CUSTOMER", at: ago(NIGHT, 1), body: "gracias!" }]);
    await expect(runWaitCheck({ conversationId: thanks.id, messageId: thanks.ids[1], kind: "holding" }, NIGHT)).resolves.toEqual({ kind: "holding", decision: "no_wait" });
    expect(sim.sent).toHaveLength(1);
  });
});

describe("programar una espera", () => {
  it("una vez por espera aunque la ráfaga traiga varios mensajes: solo la revisión de los 10 min", async () => {
    const { scheduleWaitChecks } = await import("@/lib/whatsapp/wait-assist");
    const now = new Date();
    const chat = await conversation([{ sentBy: "OWNER", at: ago(now, 120) }, { sentBy: "CUSTOMER", at: ago(now, 1) }, { sentBy: "CUSTOMER", at: ago(now, 0.5), body: "y envían a Medellín?" }]);
    const results = await Promise.all([scheduleWaitChecks(chat.id), scheduleWaitChecks(chat.id), scheduleWaitChecks(chat.id)]);
    expect(results.filter((r) => r.scheduled)).toHaveLength(1);
    // De noche el mensaje de espera corre enseguida en vez de encolarse; de día lo programa la revisión de los 10 min.
    expect(sim.queued).toEqual([{ kind: "fallback", dedup: `wait-fallback-${chat.ids[1]}`, delay: expect.any(Number) }]);
  });

  it("si a los 10 min la espera sigue abierta, la revisión programa el mensaje de espera; con el correo apagado, ningún recordatorio", async () => {
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 11), body: "quería preguntar por un pedido especial" }]);
    await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "fallback" }, DAY)).resolves.toMatchObject({ decision: "skip", reason: "not_recognized" });
    expect(sim.queued.map((job) => job.kind)).toEqual(["holding"]);
    expect(sim.queued[0]).toMatchObject({ dedup: `wait-holding-${chat.ids[1]}`, delay: 4 * 60 });
  });
});

describe("la lista «Esperando a Paula»", () => {
  it("solo quien escribió algo de verdad hace 15 min o más y nadie le respondió", async () => {
    const { findWaitingConversations } = await import("@/lib/whatsapp/waiting-list");
    const waiting = await conversation([{ sentBy: "OWNER", at: ago(DAY, 120) }, { sentBy: "CUSTOMER", at: ago(DAY, 16) }]);
    const recent = await conversation([{ sentBy: "CUSTOMER", at: ago(DAY, 10) }]);
    const thanks = await conversation([{ sentBy: "OWNER", at: ago(DAY, 60) }, { sentBy: "CUSTOMER", at: ago(DAY, 30), body: "ok gracias" }]);
    const reaction = await conversation([{ sentBy: "OWNER", at: ago(DAY, 60) }, { sentBy: "CUSTOMER", at: ago(DAY, 30), body: null, mediaType: "reaction" }]);
    const answered = await conversation([{ sentBy: "CUSTOMER", at: ago(DAY, 40) }, { sentBy: "OWNER", at: ago(DAY, 35) }]);
    const audio = await conversation([{ sentBy: "CUSTOMER", at: ago(DAY, 40), body: null, mediaType: "audio" }]);
    const found = await findWaitingConversations(store, DAY);
    expect(found.get(waiting.id)).toEqual(ago(DAY, 16));
    expect(found.has(audio.id)).toBe(true);
    for (const id of [recent.id, thanks.id, reaction.id, answered.id]) expect(found.has(id)).toBe(false);
  });
});

describe("correo de recordatorio", () => {
  it("apagado (como lo dejó Paula): nunca sale, ni por la revisión ni por el barrido, aunque haya esperas", async () => {
    const { maybeSendWaitingReminder, remindWaitingFromSweep } = await import("@/lib/whatsapp/waiting-reminder");
    const { runWaitCheck } = await import("@/lib/whatsapp/wait-assist");
    await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
    const chat = await conversation([{ sentBy: "OWNER", at: ago(DAY, 200) }, { sentBy: "CUSTOMER", at: ago(DAY, 45) }]);
    const send = vi.fn(async () => undefined);
    await expect(maybeSendWaitingReminder(store, DAY, { send })).resolves.toEqual({ sent: false, count: 0 });
    await expect(runWaitCheck({ conversationId: chat.id, messageId: chat.ids[1], kind: "reminder" }, DAY)).resolves.toMatchObject({ kind: "reminder" });
    await remindWaitingFromSweep(DAY);
    expect(send).not.toHaveBeenCalled();
    expect(await testPrisma.jobRun.count({ where: { id: { contains: store } } })).toBe(0);
  });

  it("encendido: de 8 a 23 h, si alguien espera 30 min o más, como mucho uno por hora y solo con la cuenta", async () => {
    const { maybeSendWaitingReminder } = await import("@/lib/whatsapp/waiting-reminder");
    await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
    const emails: { storeId: string; count: number }[] = [];
    const send = async (input: { storeId: string; count: number }) => {
      emails.push(input);
    };
    const late = new Date("2026-10-15T04:30:00Z"); // 23:30 Bogotá
    await expect(maybeSendWaitingReminder(store, late, { send, enabled: true })).resolves.toEqual({ sent: false, count: 0 });

    // Las pruebas de arriba ya dejaron conversaciones esperando: esa es la base.
    const before = (await maybeSendWaitingReminder(store, DAY, { send, enabled: true })).count;
    emails.length = 0;
    await conversation([{ sentBy: "OWNER", at: ago(DAY, 200) }, { sentBy: "CUSTOMER", at: ago(DAY, 45) }]);
    await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
    const first = await maybeSendWaitingReminder(store, DAY, { send, enabled: true });
    expect(first).toEqual({ sent: true, count: before + 1 });
    // Pasados 20 min ya se puede volver a contar, pero el correo no sale hasta la hora.
    await expect(maybeSendWaitingReminder(store, new Date(DAY.getTime() + 20 * MIN), { send, enabled: true })).resolves.toMatchObject({ sent: false });
    expect(emails).toEqual([{ storeId: store, count: before + 1 }]);
  });

  it("una espera de más de un día sigue en la lista, pero no cuenta para el correo", async () => {
    const { maybeSendWaitingReminder } = await import("@/lib/whatsapp/waiting-reminder");
    const { findWaitingConversations } = await import("@/lib/whatsapp/waiting-list");
    await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
    const before = (await maybeSendWaitingReminder(store, DAY, { send: async () => undefined, enabled: true })).count;
    const old = await conversation([{ sentBy: "OWNER", at: ago(DAY, 3 * 24 * 60) }, { sentBy: "CUSTOMER", at: ago(DAY, 2 * 24 * 60) }]);
    expect((await findWaitingConversations(store, DAY)).has(old.id)).toBe(true);
    await testPrisma.jobRun.deleteMany({ where: { id: { contains: store } } });
    await expect(maybeSendWaitingReminder(store, DAY, { send: async () => undefined, enabled: true })).resolves.toMatchObject({ count: before });
  });
});

