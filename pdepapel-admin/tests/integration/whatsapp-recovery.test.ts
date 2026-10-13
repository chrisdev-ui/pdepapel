import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Recuperación de eventos de WhatsApp atascados (lib/whatsapp/recovery.ts) y
 * el atraso viejo (lib/whatsapp/recovery-backlog.ts), contra la base local.
 * La cola y el aviso se inyectan; el envío a WhatsApp se simula y se cuenta.
 * Datos sintéticos.
 */
const sent = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value !== "function" || !name.startsWith("sendWhatsApp")) continue;
    stubs[name] = async (_to: unknown, body: unknown) => {
      if (name !== "sendWhatsAppTypingIndicator") sent.messages.push(typeof body === "string" ? body : JSON.stringify(body));
      return { ok: true, messageId: `wamid.sim-${randomUUID()}` };
    };
  }
  return stubs;
});

const WABA = "1449676032671804";
const MINUTE = 60_000;
let fixture: InventoryFixture;
let connectionId = "";
let phoneSeq = 0;

const newPhone = () => `57304${String(++phoneSeq).padStart(7, "0")}`;

/** Un evento guardado con `ageMs` de antigüedad, con un mensaje de la clienta escrito `sentAgoMs` atrás. */
async function storedEvent(options: {
  ageMs: number;
  phone?: string;
  sentAgoMs?: number;
  status?: "PENDING" | "RETRY" | "FAILED";
  attempts?: number;
  nextRetryAt?: Date | null;
  lastError?: string | null;
  kind?: "message" | "echo" | "status" | "empty";
}) {
  const phone = options.phone ?? newPhone();
  const createdAt = new Date(Date.now() - options.ageMs);
  const ts = String(Math.floor((Date.now() - (options.sentAgoMs ?? options.ageMs)) / 1000));
  const kind = options.kind ?? "message";
  const value =
    kind === "message"
      ? { messaging_product: "whatsapp", contacts: [{ wa_id: phone, profile: { name: "Clienta Sintética" } }], messages: [{ from: phone, id: `wamid.in-${randomUUID()}`, timestamp: ts, type: "text", text: { body: "hola, una consulta" } }] }
      : kind === "echo"
        ? { messaging_product: "whatsapp", message_echoes: [{ from: "570000000000", to: phone, id: `wamid.eco-${randomUUID()}`, timestamp: ts, type: "text", text: { body: "ya te ayudo" } }] }
        : kind === "status"
          ? { messaging_product: "whatsapp", statuses: [{ id: `wamid.out-${randomUUID()}`, status: "read", timestamp: ts, recipient_id: phone }] }
          : { messaging_product: "whatsapp" };
  const event = await testPrisma.marketplaceWebhookEvent.create({
    data: {
      connectionId,
      provider: "WHATSAPP",
      eventKey: `evt-${randomUUID()}`,
      topic: kind === "echo" ? "smb_message_echoes" : "messages",
      resource: "621067881095773",
      sellerId: WABA,
      payload: { entry: [{ id: WABA, changes: [{ field: kind === "echo" ? "smb_message_echoes" : "messages", value }] }] } as never,
      status: options.status ?? "PENDING",
      attempts: options.attempts ?? 0,
      nextRetryAt: options.nextRetryAt ?? null,
      lastError: options.lastError ?? null,
      createdAt,
      updatedAt: createdAt,
    },
    select: { id: true },
  });
  return { id: event.id, phone };
}

const statusOf = async (id: string) =>
  testPrisma.marketplaceWebhookEvent.findUniqueOrThrow({ where: { id }, select: { status: true, lastError: true } });
const conversationOf = (phone: string) =>
  testPrisma.conversation.findFirst({ where: { storeId: fixture.store.id, phone }, select: { id: true, status: true, lastInboundAt: true } });

beforeAll(async () => {
  fixture = await createInventoryFixture();
  const connection = await testPrisma.marketplaceConnection.create({ data: { storeId: fixture.store.id, provider: "WHATSAPP", status: "CONNECTED", sellerId: WABA } as never });
  connectionId = connection.id;
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const data = { botEnabled: true, botFactsApprovedAt: new Date(), botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION };
  await testPrisma.storeSettings.upsert({ where: { storeId: fixture.store.id }, create: { storeId: fixture.store.id, ...data }, update: data });
});

afterAll(async () => {
  const store = fixture.store.id;
  const conversations = (await testPrisma.conversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  await testPrisma.ignoredContact.deleteMany({ where: { storeId: store } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: store } });
  await testPrisma.marketplaceWebhookEvent.deleteMany({ where: { connectionId } });
  await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
  await testPrisma.jobRun.deleteMany({ where: { name: { startsWith: "whatsapp-recovery" } } });
  await deleteInventoryFixture(fixture);
});

beforeEach(async () => {
  sent.messages = [];
  // Cada caso arranca con los suyos: lo de casos anteriores ya no cuenta.
  await testPrisma.marketplaceWebhookEvent.updateMany({ where: { connectionId, status: { in: ["PENDING", "RETRY", "FAILED"] } }, data: { status: "PROCESSED", lastError: null } });
  await testPrisma.jobRun.deleteMany({ where: { name: { startsWith: "whatsapp-recovery" } } });
});

const recorder = () => {
  const calls: { eventId: string; key: string | null }[] = [];
  return { calls, enqueue: async (eventId: string, key: string | null | undefined) => (calls.push({ eventId, key: key ?? null }), true) };
};

describe("recuperación de eventos atascados", () => {
  it("un PENDING de más de 2 min se reencola una vez por la fila de la clienta y se procesa una vez", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    const { processWhatsAppWebhookEvent } = await import("@/lib/whatsapp/conversation-sync");
    const fresh = await storedEvent({ ageMs: MINUTE });
    const stuck = await storedEvent({ ageMs: 3 * MINUTE, sentAgoMs: 3 * MINUTE });
    const queue = recorder();
    const result = await sweepWhatsAppEvents({ force: true }, { enqueue: queue.enqueue, sendAlert: async () => {} });
    expect(result.requeued).toBe(1);
    expect(queue.calls).toEqual([{ eventId: stuck.id, key: stuck.phone }]);
    expect(await processWhatsAppWebhookEvent(stuck.id)).toMatchObject({ processed: true });
    expect(await processWhatsAppWebhookEvent(stuck.id)).toMatchObject({ processed: false, reason: "already_processed" });
    expect(sent.messages).toHaveLength(1);
    expect((await statusOf(fresh.id)).status).toBe("PENDING");
    // Reencolarlo no lo saca de turno: el procesador no lo da por «no toca aún».
    expect(await sweepWhatsAppEvents({ force: true }, { enqueue: queue.enqueue, sendAlert: async () => {} })).toMatchObject({ requeued: 0 });
  });

  it("dos barridos a la vez reencolan una sola vez", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    const stuck = await storedEvent({ ageMs: 5 * MINUTE });
    const queue = recorder();
    await Promise.all([
      sweepWhatsAppEvents({ force: true }, { enqueue: queue.enqueue, sendAlert: async () => {} }),
      sweepWhatsAppEvents({ force: true }, { enqueue: queue.enqueue, sendAlert: async () => {} }),
    ]);
    expect(queue.calls.filter((call) => call.eventId === stuck.id)).toHaveLength(1);
  });

  it("disparado dos veces en menos de 2 min, corre una vez", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    const queue = recorder();
    const first = await sweepWhatsAppEvents({}, { enqueue: queue.enqueue, sendAlert: async () => {} });
    const second = await sweepWhatsAppEvents({}, { enqueue: queue.enqueue, sendAlert: async () => {} });
    expect([first.throttled, second.throttled]).toEqual([false, true]);
    const later = await sweepWhatsAppEvents({ now: new Date(Date.now() + 3 * MINUTE) }, { enqueue: queue.enqueue, sendAlert: async () => {} });
    expect(later.throttled).toBe(false);
  });

  it("un RETRY vencido se reencola; uno con 8 intentos ya no", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    const due = await storedEvent({ ageMs: 10 * MINUTE, status: "RETRY", attempts: 2, nextRetryAt: new Date(Date.now() - MINUTE) });
    const notYet = await storedEvent({ ageMs: 10 * MINUTE, status: "RETRY", attempts: 2, nextRetryAt: new Date(Date.now() + MINUTE) });
    const spent = await storedEvent({ ageMs: 10 * MINUTE, status: "RETRY", attempts: 8, nextRetryAt: new Date(Date.now() - MINUTE) });
    const queue = recorder();
    await sweepWhatsAppEvents({ force: true }, { enqueue: queue.enqueue, sendAlert: async () => {} });
    expect(queue.calls.map((call) => call.eventId)).toEqual([due.id]);
    expect(queue.calls.map((call) => call.eventId)).not.toContain(notYet.id);
    expect(queue.calls.map((call) => call.eventId)).not.toContain(spent.id);
  });

  it("si QStash no acepta uno, no sigue intentando con los demás", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    await storedEvent({ ageMs: 6 * MINUTE });
    await storedEvent({ ageMs: 5 * MINUTE });
    let calls = 0;
    const result = await sweepWhatsAppEvents({ force: true }, { enqueue: async () => (calls += 1, false), sendAlert: async () => {} });
    expect(calls).toBe(1);
    expect(result.publishFailed).toBe(true);
  });

  it("un contacto ignorado queda PROCESSED con su nota, sin encolar", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    const { IGNORED_EVENT_NOTE } = await import("@/lib/whatsapp/ignored-contacts");
    const phone = newPhone();
    await testPrisma.ignoredContact.create({ data: { storeId: fixture.store.id, phone, reason: "prueba", createdByUserId: "test" } });
    const event = await storedEvent({ ageMs: 5 * MINUTE, phone });
    const queue = recorder();
    const result = await sweepWhatsAppEvents({ force: true }, { enqueue: queue.enqueue, sendAlert: async () => {} });
    expect(result.ignored).toBe(1);
    expect(queue.calls).toEqual([]);
    expect(await statusOf(event.id)).toEqual({ status: "PROCESSED", lastError: IGNORED_EVENT_NOTE });
  });

  it("de más de 72 h queda FAILED con la nota del atraso, y el procesador normal no lo toma", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    const { WHATSAPP_BACKLOG_NOTE, processWhatsAppWebhookEvent } = await import("@/lib/whatsapp/conversation-sync");
    const old = await storedEvent({ ageMs: 80 * 60 * MINUTE });
    const queue = recorder();
    const result = await sweepWhatsAppEvents({ force: true }, { enqueue: queue.enqueue, sendAlert: async () => {} });
    expect(result.tooOld).toBe(1);
    expect(queue.calls).toEqual([]);
    expect(await statusOf(old.id)).toEqual({ status: "FAILED", lastError: WHATSAPP_BACKLOG_NOTE });
    expect(await processWhatsAppWebhookEvent(old.id)).toMatchObject({ processed: false, reason: "failed" });
  });

  it("un mensaje que llega con más de 15 min se archiva sin bot y queda para Paula si nadie contestó", async () => {
    const { processWhatsAppWebhookEvent } = await import("@/lib/whatsapp/conversation-sync");
    const late = await storedEvent({ ageMs: 20 * MINUTE, sentAgoMs: 20 * MINUTE });
    expect(await processWhatsAppWebhookEvent(late.id)).toMatchObject({ processed: true, botOutcomes: [] });
    expect(sent.messages).toHaveLength(0);
    expect(await conversationOf(late.phone)).toMatchObject({ status: "NEEDS_OWNER" });
    expect(await testPrisma.whatsAppBotShadowRun.count({ where: { conversationId: (await conversationOf(late.phone))!.id } })).toBe(0);
  });

  it("archivar un mensaje viejo no mueve la conversación hacia atrás", async () => {
    const { processWhatsAppWebhookEvent } = await import("@/lib/whatsapp/conversation-sync");
    const phone = newPhone();
    const recent = new Date(Date.now() - MINUTE);
    await testPrisma.conversation.create({ data: { storeId: fixture.store.id, phone, status: "OPEN", lastInboundAt: recent, lastOutboundAt: recent } });
    const late = await storedEvent({ ageMs: 30 * MINUTE, sentAgoMs: 30 * MINUTE, phone });
    await processWhatsAppWebhookEvent(late.id);
    const echo = await storedEvent({ ageMs: 30 * MINUTE, sentAgoMs: 30 * MINUTE, phone, kind: "echo" });
    await processWhatsAppWebhookEvent(echo.id);
    const row = await testPrisma.conversation.findFirstOrThrow({ where: { storeId: fixture.store.id, phone }, select: { lastInboundAt: true, lastOutboundAt: true } });
    expect(row.lastInboundAt?.getTime()).toBe(recent.getTime());
    expect(row.lastOutboundAt?.getTime()).toBe(recent.getTime());
  });

  it("avisa una sola vez por hora si hay atascados, con conteos", async () => {
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    await storedEvent({ ageMs: 12 * MINUTE });
    const alerts: unknown[] = [];
    const deps = { enqueue: async () => false, sendAlert: async (counts: unknown) => void alerts.push(counts) };
    await sweepWhatsAppEvents({ force: true }, deps);
    await sweepWhatsAppEvents({ force: true }, deps);
    expect(alerts).toEqual([{ pending: 1, retryOverdue: 0 }]);
    await sweepWhatsAppEvents({ force: true, now: new Date(Date.now() + 61 * MINUTE) }, deps);
    expect(alerts).toHaveLength(2);
  });
});

describe("atraso viejo (guion de recuperación)", () => {
  it("archiva mensajes y ecos como historial, sin bot ni Paula; ignorado y vacío quedan aparte", async () => {
    const { recoverWhatsAppBacklog, BACKLOG_EMPTY_NOTE } = await import("@/lib/whatsapp/recovery-backlog");
    const { sweepWhatsAppEvents } = await import("@/lib/whatsapp/recovery");
    const { IGNORED_EVENT_NOTE } = await import("@/lib/whatsapp/ignored-contacts");
    const age = 22 * 24 * 60 * MINUTE;
    const message = await storedEvent({ ageMs: age });
    const echo = await storedEvent({ ageMs: age, kind: "echo" });
    const status = await storedEvent({ ageMs: age, kind: "status" });
    const empty = await storedEvent({ ageMs: age, kind: "empty" });
    const ignoredPhone = newPhone();
    await testPrisma.ignoredContact.create({ data: { storeId: fixture.store.id, phone: ignoredPhone, reason: "prueba", createdByUserId: "test" } });
    const ignored = await storedEvent({ ageMs: age, phone: ignoredPhone });
    // La recuperación automática los marca primero (el primer webhook tras el despliegue).
    await sweepWhatsAppEvents({ force: true }, { enqueue: async () => true, sendAlert: async () => {} });

    expect(await recoverWhatsAppBacklog({ apply: false })).toEqual({
      mode: "dry-run",
      plan: { events: 5, ignored: 1, empty: 1, statusesOnly: 1, withMessagesOrEchoes: 2, customerMessages: 1, ownerEchoes: 1 },
      expected: {
        conversationsCreated: 2,
        neverSeenContactsShownAsRecuperado: 1,
        newConversationsWithOnlyPaulaEchoes: 1,
        existingConversationsTouched: 0,
        conversationsMovedToWaiting: 0,
        lastInboundAtMovedBackwards: 0,
        botRunsOrSends: 0,
        finalStatus: { PROCESSED: 4, FAILED: 1 },
      },
    });
    const applied = await recoverWhatsAppBacklog({ apply: true });
    expect(applied).toMatchObject({
      mode: "apply",
      measured: {
        done: { ignored: 1, empty: 1, processed: 3, notProcessed: 0 },
        conversationsCreated: 2,
        neverSeenContactsShownAsRecuperado: 1,
        conversationsMovedToWaiting: 0,
        lastInboundAtMovedBackwards: 0,
        lastOutboundAtMovedBackwards: 0,
        botRunsOrSends: 0,
        finalStatus: { PROCESSED: 4, FAILED: 1 },
      },
    });
    expect(sent.messages).toHaveLength(0);

    const conversation = await conversationOf(message.phone);
    expect(conversation).toMatchObject({ status: "OPEN" });
    const filed = await testPrisma.conversationMessage.findFirstOrThrow({ where: { conversationId: conversation!.id, direction: "INBOUND" }, select: { metadata: true } });
    expect((filed.metadata as { recovered?: string }).recovered).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await conversationOf(ignoredPhone)).toBeNull();
    expect(await statusOf(ignored.id)).toEqual({ status: "PROCESSED", lastError: IGNORED_EVENT_NOTE });
    expect(await statusOf(empty.id)).toEqual({ status: "FAILED", lastError: BACKLOG_EMPTY_NOTE });
    expect((await statusOf(status.id)).status).toBe("PROCESSED");
    expect((await statusOf(echo.id)).status).toBe("PROCESSED");
    // Una conversación que ya existía con actividad más nueva no se mueve ni pasa a Paula.
    const phone = newPhone();
    const recent = new Date(Date.now() - MINUTE);
    await testPrisma.conversation.create({ data: { storeId: fixture.store.id, phone, status: "OPEN", lastInboundAt: recent, lastOutboundAt: recent } });
    await storedEvent({ ageMs: age, phone });
    expect(await recoverWhatsAppBacklog({ apply: true })).toMatchObject({
      expected: { existingConversationsTouched: 1, conversationsCreated: 0 },
      measured: { conversationsMovedToWaiting: 0, lastInboundAtMovedBackwards: 0, botRunsOrSends: 0, finalStatus: { PROCESSED: 1 } },
    });
    expect(await conversationOf(phone)).toMatchObject({ status: "OPEN", lastInboundAt: recent });
    // Correrlo de nuevo no hace nada.
    expect(await recoverWhatsAppBacklog({ apply: true })).toMatchObject({ plan: { events: 0 } });
  });
});
