import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderStatus, OrderType } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Lote «estabilidad del bot» (2026-10-27): cada camino que antes terminaba en
 * silencio. Bot real, base local y envío a WhatsApp simulado; datos sintéticos.
 */
const sent = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value !== "function" || !name.startsWith("sendWhatsApp")) continue;
    stubs[name] = async (_to: unknown, body: unknown) => {
      if (name !== "sendWhatsAppTypingIndicator") sent.messages.push(typeof body === "string" ? body : JSON.stringify(body));
      return { ok: true, externalId: `wamid.sim-${randomUUID()}` };
    };
  }
  return stubs;
});

let fixture: InventoryFixture;
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

async function settings(data: Record<string, unknown> = {}) {
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const base = { botEnabled: true, botReadBursts: false, botFactsApprovedAt: new Date(), botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION, ...data };
  await testPrisma.storeSettings.upsert({ where: { storeId: fixture.store.id }, create: { storeId: fixture.store.id, ...base }, update: base });
}

async function conversation(data: Record<string, unknown> = {}) {
  const phone = `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const row = await testPrisma.conversation.create({ data: { storeId: fixture.store.id, phone, status: "OPEN", lastInboundAt: new Date(), ...data } });
  return { id: row.id, phone };
}

async function outbound(conversationId: string, sentBy: "BOT" | "OWNER", at: Date, body = "mensaje") {
  await testPrisma.conversationMessage.create({ data: { conversationId, direction: "OUTBOUND", sentBy, body, createdAt: at, status: "SENT" } });
}

async function inbound(conversationId: string, body: string | null, mediaType: string | null = null, at = new Date()) {
  const externalId = `wamid.in-${randomUUID()}`;
  await testPrisma.conversationMessage.create({ data: { conversationId, direction: "INBOUND", sentBy: "CUSTOMER", body, mediaType, createdAt: at, externalId } });
  return { body: body ?? "", at, externalId };
}

async function run(chat: { id: string; phone: string }, message: { body: string; at: Date; externalId: string }, extra: Record<string, unknown> = {}) {
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  return runWhatsAppBot({
    conversationId: chat.id,
    recipient: chat.phone,
    body: message.body,
    inboundAt: message.at,
    inboundMessageId: message.externalId,
    skipHumanPause: true,
    keywords: [],
    customerPhone: chat.phone,
    ...extra,
  });
}

const status = (id: string) => testPrisma.conversation.findUniqueOrThrow({ where: { id }, select: { status: true, needsOwnerReason: true } });

beforeAll(async () => {
  fixture = await createInventoryFixture();
});

afterAll(async () => {
  const conversations = await testPrisma.conversation.findMany({ where: { storeId: fixture.store.id }, select: { id: true } });
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations.map((row) => row.id) } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: fixture.store.id } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: fixture.store.id } });
  await deleteInventoryFixture(fixture);
});

beforeEach(async () => {
  sent.messages = [];
  await settings();
});

describe("«es de Paula» tras un traspaso del bot vence a las 24 h", () => {
  it("con lo último que salió hace más de 24 h, el siguiente mensaje lo contesta el bot", async () => {
    const chat = await conversation({ status: "NEEDS_OWNER", needsOwnerReason: null, lastOwnerAt: ago(20 * 24 * HOUR), lastOutboundAt: ago(20 * 24 * HOUR) });
    await outbound(chat.id, "OWNER", ago(20 * 24 * HOUR));
    const result = await run(chat, await inbound(chat.id, "hola"));
    expect(result.outcome).toBe("replied_business_fact");
    expect(sent.messages).toHaveLength(1);
    await expect(status(chat.id)).resolves.toMatchObject({ status: "OPEN", needsOwnerReason: null });
  });

  it("un traspaso reciente sigue callado aunque Paula escribiera hace días", async () => {
    const chat = await conversation({ status: "NEEDS_OWNER", needsOwnerReason: null, lastOwnerAt: ago(5 * 24 * HOUR), lastOutboundAt: ago(2 * HOUR) });
    await outbound(chat.id, "OWNER", ago(5 * 24 * HOUR));
    await outbound(chat.id, "BOT", ago(2 * HOUR), "Le paso tu mensaje a Paula");
    const result = await run(chat, await inbound(chat.id, "hola"));
    expect(result.outcome).toBe("skipped_needs_owner");
    expect(sent.messages).toHaveLength(0);
  });
});

describe("stickers, ubicaciones, contactos y tipos que no se leen", () => {
  it("si es lo primero que manda, se saluda con el menú", async () => {
    const chat = await conversation();
    const result = await run(chat, await inbound(chat.id, null, "sticker"), { body: "", bodilessType: "sticker" });
    expect(result).toMatchObject({ outcome: "replied_business_fact", trigger: "welcome" });
  });

  it("a mitad de la conversación va a Paula como una foto, con su acuse", async () => {
    const { UNREADABLE_MEDIA_ACKNOWLEDGEMENT } = await import("@/lib/whatsapp/bot-acknowledgements");
    const { formatBotReply } = await import("@/lib/whatsapp/bot-matching");
    const chat = await conversation();
    await outbound(chat.id, "BOT", ago(HOUR));
    const result = await run(chat, await inbound(chat.id, null, "location"), { body: "", bodilessType: "location" });
    expect(result.outcome).toBe("escalated_unprocessable_media");
    expect(sent.messages).toEqual([formatBotReply(UNREADABLE_MEDIA_ACKNOWLEDGEMENT)]);
    await expect(status(chat.id)).resolves.toMatchObject({ status: "NEEDS_OWNER" });
  });
});

describe("un carrito del catálogo sin nota", () => {
  it("de entrada: va a Paula sin menú de bienvenida ni acuse", async () => {
    const chat = await conversation();
    const result = await run(chat, await inbound(chat.id, null, "order"), { body: "", bodilessType: "order" });
    expect(result.outcome).toBe("escalated_catalog_cart");
    expect(sent.messages).toEqual([]);
    await expect(status(chat.id)).resolves.toMatchObject({ status: "NEEDS_OWNER" });
  });

  it("a mitad de la conversación: tampoco «Recibí lo que me enviaste»", async () => {
    const chat = await conversation();
    await outbound(chat.id, "BOT", ago(HOUR));
    const result = await run(chat, await inbound(chat.id, null, "order"), { body: "", bodilessType: "order" });
    expect(result.outcome).toBe("escalated_catalog_cart");
    expect(sent.messages).toEqual([]);
  });
});

describe("una foto con pie no entra a la ráfaga", () => {
  it("con el modo ráfaga encendido, el pie se contesta por el camino de siempre", async () => {
    await settings({ botReadBursts: true });
    const chat = await conversation();
    await outbound(chat.id, "BOT", ago(HOUR));
    const message = await inbound(chat.id, "mmm y esto qué", "image");
    const result = await run(chat, message, { captionedMedia: true });
    expect(result.outcome).not.toBe("skipped_superseded");
    expect(result.outcome).toBe("escalated_no_match");
  });
});

describe("el tope de la ventana no se come el aviso de que Paula escribe", () => {
  it("con 4 mensajes del bot en 10 min, el toque de «Hablar con Paula» se confirma igual", async () => {
    const chat = await conversation();
    for (let i = 0; i < 4; i += 1) await outbound(chat.id, "BOT", ago((5 - i) * 60_000));
    const tap = await inbound(chat.id, "Hablar con Paula");
    const result = await run(chat, tap, { interactiveReplyId: "owner" });
    expect(result.outcome).toBe("escalated_owner_requested");
    expect(sent.messages).toHaveLength(1);
  });

  it("una respuesta normal sí la frena el tope, y se dice por qué", async () => {
    const chat = await conversation();
    for (let i = 0; i < 4; i += 1) await outbound(chat.id, "BOT", ago((5 - i) * 60_000));
    const result = await run(chat, await inbound(chat.id, "hola"));
    expect(result.outcome).toBe("skipped_cap");
    expect(sent.messages).toHaveLength(0);
  });
});

describe("«BAJA» en el chat", () => {
  async function order(phone: string) {
    return testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PAID,
        type: OrderType.STANDARD,
        fullName: "Clienta Baja",
        phone: `+${phone}`,
        address: "Calle 1 # 2-3",
        subtotal: 10000,
        total: 10000,
        whatsappOptInAt: new Date(),
        whatsappOptInVersion: "2026-10-26",
      },
    });
  }

  it("anota la baja en sus pedidos y confirma una sola vez, aunque Paula esté en la pausa", async () => {
    const { OPT_OUT_CONFIRMATION } = await import("@/lib/whatsapp/opt-out");
    const chat = await conversation({ lastOwnerAt: ago(HOUR) });
    const own = await order(chat.phone);
    // Escrito a mano con espacios: también es suyo.
    const spaced = await testPrisma.order.update({ where: { id: (await order(chat.phone)).id }, data: { phone: `+57 ${chat.phone.slice(2, 5)} ${chat.phone.slice(5, 8)} ${chat.phone.slice(8)}` } });
    const other = await order("573009999999");
    const first = await run(chat, await inbound(chat.id, "BAJA"));
    expect(first.outcome).toBe("replied_opt_out");
    expect(sent.messages).toEqual([OPT_OUT_CONFIRMATION]);
    const again = await run(chat, await inbound(chat.id, "baja!"));
    expect(again.outcome).toBe("replied_opt_out");
    expect(sent.messages).toHaveLength(1);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: own.id } })).whatsappOptOutAt).not.toBeNull();
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: spaced.id } })).whatsappOptOutAt).not.toBeNull();
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: other.id } })).whatsappOptOutAt).toBeNull();
    await testPrisma.order.deleteMany({ where: { id: { in: [own.id, spaced.id, other.id] } } });
  });

  it("«¿tienen la carpeta baja?» es una pregunta, no una baja", async () => {
    const chat = await conversation();
    const own = await order(chat.phone);
    const result = await run(chat, await inbound(chat.id, "¿tienen la carpeta baja?"));
    expect(result.outcome).not.toBe("replied_opt_out");
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: own.id } })).whatsappOptOutAt).toBeNull();
    await testPrisma.order.deleteMany({ where: { id: own.id } });
  });
});

describe("el segundo «no lo encontré» solo cuenta dentro de 24 h", () => {
  async function miss(conversationId: string, at: Date) {
    await testPrisma.conversationMessage.create({
      data: { conversationId, direction: "OUTBOUND", sentBy: "BOT", body: "No encontré eso por aquí", createdAt: at, status: "SENT", metadata: { noMatch: { reason: "zero_results" } } },
    });
  }

  it("un fallo de hace 1 h sí cuenta: el siguiente va a Paula", async () => {
    const { lastBotSearchMissed } = await import("@/lib/whatsapp/bot");
    const chat = await conversation();
    await miss(chat.id, ago(HOUR));
    await expect(lastBotSearchMissed(chat.id)).resolves.toBe(true);
  });

  it("un fallo de hace 25 h ya no cuenta: el bot vuelve a buscar", async () => {
    const { lastBotSearchMissed } = await import("@/lib/whatsapp/bot");
    const chat = await conversation();
    await miss(chat.id, ago(25 * HOUR));
    await expect(lastBotSearchMissed(chat.id)).resolves.toBe(false);
  });

  it("si lo último del bot no fue un fallo, no cuenta aunque sea reciente", async () => {
    const { lastBotSearchMissed } = await import("@/lib/whatsapp/bot");
    const chat = await conversation();
    await miss(chat.id, ago(2 * HOUR));
    await outbound(chat.id, "BOT", ago(HOUR), "Sí, mira 💛");
    await expect(lastBotSearchMissed(chat.id)).resolves.toBe(false);
  });
});
