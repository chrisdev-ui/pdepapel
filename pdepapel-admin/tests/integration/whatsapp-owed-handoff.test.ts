import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El aviso «Le paso tu mensaje a Paula» que se cancela porque la clienta
 * siguió escribiendo durante la pausa. Bot real, base local y envío a WhatsApp
 * simulado; cada caso cuenta los mensajes que salieron. Datos sintéticos.
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
let fixture: InventoryFixture;
let connectionId = "";

async function setBot(enabled: boolean) {
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const data = { botEnabled: enabled, botFactsApprovedAt: new Date(), botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION };
  await testPrisma.storeSettings.upsert({ where: { storeId: fixture.store.id }, create: { storeId: fixture.store.id, ...data }, update: data });
}

async function conversation() {
  const phone = `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const row = await testPrisma.conversation.create({ data: { storeId: fixture.store.id, phone, status: "OPEN", lastInboundAt: new Date() } });
  return { id: row.id, phone };
}

/** Lo que llegó al webhook y todavía espera en la fila de esa clienta. */
async function queuedEvent(phone: string, body: string, processed = false) {
  const wamid = `wamid.q-${randomUUID()}`;
  const event = await testPrisma.marketplaceWebhookEvent.create({
    data: {
      connectionId,
      provider: "WHATSAPP",
      eventKey: `evt-${randomUUID()}`,
      topic: "messages",
      resource: "621067881095773",
      sellerId: WABA,
      payload: {
        entry: [
          {
            id: WABA,
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: { display_phone_number: "570000000000", phone_number_id: "621067881095773" },
                  contacts: [{ wa_id: phone, profile: { name: "Clienta Sintética" } }],
                  messages: [{ from: phone, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
                },
              },
            ],
          },
        ],
      } as never,
      status: processed ? "PROCESSED" : "PENDING",
      processedAt: processed ? new Date() : null,
    },
    select: { id: true, createdAt: true },
  });
  return event;
}

async function inbound(conversationId: string, body: string, at = new Date()) {
  const externalId = `wamid.in-${randomUUID()}`;
  await testPrisma.conversationMessage.create({ data: { conversationId, direction: "INBOUND", sentBy: "CUSTOMER", body, createdAt: at, externalId } });
  return { body, at, externalId };
}

async function answer(
  chat: { id: string; phone: string },
  message: { body: string; at: Date; externalId: string },
  event?: { id: string; createdAt: Date },
) {
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  return runWhatsAppBot({
    conversationId: chat.id,
    recipient: chat.phone,
    body: message.body,
    inboundAt: message.at,
    inboundMessageId: message.externalId,
    skipHumanPause: true,
    keywords: [],
    ...(event ? { eventId: event.id, eventCreatedAt: event.createdAt, customerPhone: chat.phone } : {}),
  });
}

const later = (ms: number) => new Date(Date.now() + ms);

/** El primer mensaje no se entiende y, durante la pausa, ya llegó otro: el aviso se cancela. */
async function handoffCancelledByBurst(chat: { id: string; phone: string }) {
  const first = await inbound(chat.id, "mmm oye");
  const own = await queuedEvent(chat.phone, "mmm oye", true);
  await queuedEvent(chat.phone, "una cosita");
  const result = await answer(chat, first, own);
  expect(result.outcome).toBe("escalated_no_match");
  expect(sent.messages).toHaveLength(0);
  await testPrisma.marketplaceWebhookEvent.updateMany({ where: { connectionId, processedAt: null }, data: { processedAt: new Date(), status: "PROCESSED" } });
}

async function botMessages(conversationId: string) {
  return testPrisma.conversationMessage.findMany({ where: { conversationId, sentBy: "BOT" }, select: { body: true } });
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
  const connection = await testPrisma.marketplaceConnection.create({
    data: { storeId: fixture.store.id, provider: "WHATSAPP", status: "CONNECTED", sellerId: WABA } as never,
  });
  connectionId = connection.id;
});

afterAll(async () => {
  const conversations = await testPrisma.conversation.findMany({ where: { storeId: fixture.store.id }, select: { id: true } });
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations.map((row) => row.id) } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.marketplaceWebhookEvent.deleteMany({ where: { connectionId } });
  await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
  await deleteInventoryFixture(fixture);
});

beforeEach(async () => {
  sent.messages = [];
  await setBot(true);
});

describe("aviso de escalada debido", () => {
  it("la secuencia del 12/10: no se entiende, edita y escribe en la pausa, saluda, escribe → un solo aviso", async () => {
    const { NO_MATCH_ACKNOWLEDGEMENT } = await import("@/lib/whatsapp/bot");
    const { formatBotReply } = await import("@/lib/whatsapp/bot-matching");
    const chat = await conversation();
    await handoffCancelledByBurst(chat);
    expect(await testPrisma.conversation.findUniqueOrThrow({ where: { id: chat.id }, select: { status: true } })).toEqual({ status: "NEEDS_OWNER" });

    // La edición se guarda pero el bot no corre con ella, como en producción.
    await testPrisma.conversationMessage.create({ data: { conversationId: chat.id, direction: "INBOUND", sentBy: "CUSTOMER", body: null, mediaType: "edit", createdAt: later(6_000) } });
    const greeting = await inbound(chat.id, "hola", later(14_000));
    expect((await answer(chat, greeting)).outcome).toBe("escalated_owed_notice");
    const next = await inbound(chat.id, "quería preguntar algo", later(27_000));
    expect((await answer(chat, next)).outcome).toBe("skipped_needs_owner");

    expect(sent.messages).toHaveLength(1);
    expect(await botMessages(chat.id)).toEqual([{ body: formatBotReply(NO_MATCH_ACKNOWLEDGEMENT) }]);
  });

  it("si Paula contesta antes del siguiente mensaje, no sale nada", async () => {
    const chat = await conversation();
    await handoffCancelledByBurst(chat);
    await testPrisma.conversationMessage.create({ data: { conversationId: chat.id, direction: "OUTBOUND", sentBy: "OWNER", status: "SENT", body: "Hola, ya te ayudo", createdAt: later(5_000) } });
    await testPrisma.conversation.update({ where: { id: chat.id }, data: { lastOwnerAt: later(5_000) } });
    const next = await inbound(chat.id, "gracias", later(10_000));
    expect((await answer(chat, next)).outcome).toBe("skipped_owner_active");
    expect(sent.messages).toHaveLength(0);
  });

  it("si Paula escribió desde el panel (sin pausa), tampoco", async () => {
    const chat = await conversation();
    await handoffCancelledByBurst(chat);
    await testPrisma.conversationMessage.create({ data: { conversationId: chat.id, direction: "OUTBOUND", sentBy: "OWNER", status: "SENT", body: "Hola, ya te ayudo", createdAt: later(5_000) } });
    const next = await inbound(chat.id, "ok", later(10_000));
    expect((await answer(chat, next)).outcome).toBe("skipped_needs_owner");
    expect(sent.messages).toHaveLength(0);
  });

  it("ráfaga de 3: los dos primeros se saltan y el último lleva el único aviso; repetirlo no manda otro", async () => {
    const chat = await conversation();
    await handoffCancelledByBurst(chat);
    const second = await inbound(chat.id, "es que", later(3_000));
    const third = await inbound(chat.id, "necesito algo", later(4_000));
    expect((await answer(chat, second)).outcome).toBe("skipped_superseded");
    expect((await answer(chat, third)).outcome).toBe("escalated_owed_notice");
    expect((await answer(chat, third)).outcome).toBe("skipped_needs_owner");
    expect(sent.messages).toHaveLength(1);
  });

  it("dos corridas a la vez mandan un solo aviso", async () => {
    const chat = await conversation();
    await handoffCancelledByBurst(chat);
    const next = await inbound(chat.id, "hola?", later(5_000));
    const outcomes = await Promise.all([answer(chat, next), answer(chat, next)]);
    expect(outcomes.map((result) => result.outcome).sort()).toEqual(["escalated_owed_notice", "skipped_needs_owner"]);
    expect(sent.messages).toHaveLength(1);
  });

  it("con el interruptor del bot apagado, no sale nada", async () => {
    const chat = await conversation();
    await handoffCancelledByBurst(chat);
    await setBot(false);
    const next = await inbound(chat.id, "hola?", later(5_000));
    expect((await answer(chat, next)).outcome).toBe("skipped_bot_disabled");
    expect(sent.messages).toHaveLength(0);
  });

  it("devuelta al bot, sigue el camino normal y el aviso viejo no sale", async () => {
    const { NO_MATCH_ACKNOWLEDGEMENT } = await import("@/lib/whatsapp/bot");
    const { formatBotReply } = await import("@/lib/whatsapp/bot-matching");
    const chat = await conversation();
    await handoffCancelledByBurst(chat);
    await testPrisma.conversation.update({ where: { id: chat.id }, data: { status: "OPEN" } });
    const next = await inbound(chat.id, "hola", later(5_000));
    expect((await answer(chat, next)).outcome).not.toBe("escalated_owed_notice");
    expect((await botMessages(chat.id)).map((row) => row.body)).not.toContain(formatBotReply(NO_MATCH_ACKNOWLEDGEMENT));
  });

  it("con el tope de 4 mensajes en 10 minutos ya lleno, no sale y queda descartado", async () => {
    const chat = await conversation();
    for (let index = 0; index < 4; index += 1) {
      await testPrisma.conversationMessage.create({ data: { conversationId: chat.id, direction: "OUTBOUND", sentBy: "BOT", status: "SENT", body: `respuesta ${index}`, createdAt: new Date(Date.now() - 60_000 + index) } });
    }
    await handoffCancelledByBurst(chat);
    const next = await inbound(chat.id, "hola?", later(5_000));
    expect((await answer(chat, next)).outcome).toBe("skipped_needs_owner");
    const again = await inbound(chat.id, "?", later(6_000));
    expect((await answer(chat, again)).outcome).toBe("skipped_needs_owner");
    expect(sent.messages).toHaveLength(0);
  });
});
