import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Modo ráfaga del bot (lib/whatsapp/burst.ts) con el bot real, la base local,
 * el envío a WhatsApp simulado y el clasificador de productos doblado (se
 * anota qué texto le llegó). Cada caso corre con el interruptor encendido y
 * apagado, y cuenta exactamente los mensajes que salieron. Datos sintéticos.
 */
const sent = vi.hoisted(() => ({
  messages: [] as string[],
  classified: [] as string[],
  onTyping: null as null | (() => Promise<void>),
  classifierDelayMs: 0,
  reruns: [] as { rerun: { conversationId: string; messageId: string; attempt: number }; delaySeconds: number }[],
}));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value !== "function" || !name.startsWith("sendWhatsApp")) continue;
    stubs[name] = async (_to: unknown, body: unknown) => {
      if (name === "sendWhatsAppTypingIndicator") {
        const hook = sent.onTyping;
        sent.onTyping = null;
        await hook?.();
      } else {
        sent.messages.push(typeof body === "string" ? body : JSON.stringify(body));
      }
      return { ok: true, messageId: `wamid.sim-${randomUUID()}` };
    };
  }
  return stubs;
});
vi.mock("@/lib/ai-model-providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-model-providers")>()),
  createAiProviders: () => ({ openai: { name: "openai" }, gemini: null }),
  getAiRoutingStore: () => null,
}));
vi.mock("@/lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-provider")>()),
  runStructured: async (input: { feature: string; prompt: string }) => {
    if (input.feature !== "whatsapp.classifier") throw new Error("solo el clasificador de productos");
    sent.classified.push(input.prompt);
    if (sent.classifierDelayMs) await new Promise((resolve) => setTimeout(resolve, sent.classifierDelayMs));
    const slots = /cuaderno/i.test(input.prompt)
      ? { productType: "cuaderno", character: "Norma", descriptor: null }
      : /lapicero/i.test(input.prompt)
        ? { productType: "lapicero", character: null, descriptor: "gel" }
        : { productType: "agenda", character: null, descriptor: "2027" };
    return { output: { intent: "product.availability", ...slots }, provider: "openai", usage: undefined };
  },
}));

vi.mock("@/lib/whatsapp/queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/queue")>()),
  enqueueWhatsAppBotRerun: async (rerun: { conversationId: string; messageId: string; attempt: number }, _key: string | null, delaySeconds: number) => {
    sent.reruns.push({ rerun, delaySeconds });
    return true;
  },
}));

const WABA = "1449676032671804";
const SECOND = 1000;
let fixture: InventoryFixture;
let connectionId = "";
let cuadernoId = "";

async function setSettings(readBursts: boolean, extra: Record<string, unknown> = {}) {
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const { PRODUCT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-products");
  const { ORDER_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-order-request");
  const data = {
    botEnabled: true,
    botReadBursts: readBursts,
    botFactsApprovedAt: new Date(),
    botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
    botProductsApprovedAt: new Date(),
    botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    botCasualApprovedAt: new Date(),
    botCasualVersion: ORDER_TEMPLATES_VERSION,
    ...extra,
  };
  await testPrisma.storeSettings.upsert({ where: { storeId: fixture.store.id }, create: { storeId: fixture.store.id, ...data }, update: data });
}

async function conversation(extra: Record<string, unknown> = {}) {
  const phone = `57302${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const row = await testPrisma.conversation.create({ data: { storeId: fixture.store.id, phone, status: "OPEN", lastInboundAt: new Date(), ...extra } });
  return { id: row.id, phone };
}

type Line = { body: string; at: Date; externalId: string; id: string };

/** Lo que la clienta escribió seguido, `gap` segundos entre uno y otro, terminando ahora. */
async function burst(conversationId: string, lines: string[], gap = 4) {
  const start = Date.now() - (lines.length - 1) * gap * SECOND;
  const rows: Line[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const body = lines[index];
    const at = new Date(start + index * gap * SECOND);
    const externalId = `wamid.in-${randomUUID()}`;
    const row = await testPrisma.conversationMessage.create({ data: { conversationId, direction: "INBOUND", sentBy: "CUSTOMER", body, createdAt: at, externalId } });
    rows.push({ body, at, externalId, id: row.id });
  }
  return rows;
}

async function answer(chat: { id: string; phone: string }, line: Line, extra: Record<string, unknown> = {}) {
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  return runWhatsAppBot({
    conversationId: chat.id,
    recipient: chat.phone,
    body: line.body,
    inboundAt: line.at,
    inboundMessageId: line.externalId,
    skipHumanPause: true,
    keywords: [],
    ...extra,
  });
}

/** Como en producción: el bot corre con cada mensaje, en orden. */
async function answerAll(chat: { id: string; phone: string }, lines: Line[]) {
  const outcomes: string[] = [];
  for (const line of lines) outcomes.push((await answer(chat, line)).outcome);
  return outcomes;
}

async function botBodies(conversationId: string) {
  const rows = await testPrisma.conversationMessage.findMany({ where: { conversationId, sentBy: "BOT" }, orderBy: { createdAt: "asc" }, select: { body: true } });
  return rows.map((row) => row.body ?? "");
}

/** La oferta «¿Lo quieres?» del bot, un minuto antes. */
async function withOffer(conversationId: string) {
  await testPrisma.conversationMessage.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      sentBy: "BOT",
      status: "SENT",
      body: "Sí 💛 Tengo Cuaderno Norma Ráfaga 100 hojas en $12.000. ¿Lo quieres?",
      createdAt: new Date(Date.now() - 60 * SECOND),
      externalId: `wamid.out-${randomUUID()}`,
      metadata: { shown: { ids: [cuadernoId], intent: "product.search" } } as never,
    },
  });
}

async function queuedEvent(phone: string, body: string, processed = false) {
  return testPrisma.marketplaceWebhookEvent.create({
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
                  messages: [{ from: phone, id: `wamid.q-${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
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
}

const NO_MATCH = "Esa no me la sé 💛 Le paso tu mensaje a Paula y ella te escribe apenas pueda.";
const results: { escenario: string; modo: string; enviados: number; resultado: string }[] = [];
const record = (escenario: string, on: boolean, enviados: number, resultado: string) => results.push({ escenario, modo: on ? "ráfaga" : "actual", enviados, resultado });

beforeAll(async () => {
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } });
  const product = (name: string, price: number, stock: number) =>
    testPrisma.product.create({
      data: { storeId: store, categoryId: fixture.category.id, ...attributes, name, description: "Sintético", slug: `rafaga-${randomUUID().slice(0, 8)}`, price, stock, sku: `RAF-${randomUUID().slice(0, 6)}` } as never,
    });
  cuadernoId = (await product("Cuaderno Norma Ráfaga 100 hojas", 12000, 5)).id;
  await product("Lapicero gel Ráfaga", 3500, 40);
  await product("Agenda Ráfaga 2027", 30000, 4);
  const connection = await testPrisma.marketplaceConnection.create({ data: { storeId: store, provider: "WHATSAPP", status: "CONNECTED", sellerId: WABA } as never });
  connectionId = connection.id;
});

afterAll(async () => {
  writeFileSync(process.env.BURST_TABLE ?? "/dev/null", JSON.stringify(results));
  const store = fixture.store.id;
  const conversations = (await testPrisma.conversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.whatsAppBotShadowRun.deleteMany({ where: { storeId: store } });
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: store } });
  await testPrisma.marketplaceWebhookEvent.deleteMany({ where: { connectionId } });
  await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
  await testPrisma.product.deleteMany({ where: { storeId: store, description: "Sintético" } });
  await deleteInventoryFixture(fixture);
});

beforeEach(() => {
  sent.messages = [];
  sent.classified = [];
  sent.onTyping = null;
  sent.classifierDelayMs = 0;
  sent.reruns = [];
});

describe.each([true, false])("modo ráfaga %s", (on) => {
  beforeEach(async () => {
    await setSettings(on);
  });

  it("saludo + pregunta: contesta la pregunta, una vez", async () => {
    const chat = await conversation();
    const outcomes = await answerAll(chat, await burst(chat.id, ["Hola", "Cómo estás?", "Tienes el cuaderno Norma?"]));
    expect(outcomes.slice(0, 2)).toEqual(["skipped_superseded", "skipped_superseded"]);
    expect(outcomes[2]).toMatch(/^replied_product/);
    expect(sent.messages).toHaveLength(1);
    expect(sent.classified).toEqual(["Tienes el cuaderno Norma?"]);
    record("saludo + pregunta", on, sent.messages.length, outcomes[2]);
  });

  it("pregunta + relleno: ráfaga contesta la pregunta; el actual se la pasa a Paula", async () => {
    const chat = await conversation();
    const outcomes = await answerAll(chat, await burst(chat.id, ["Tienes el cuaderno Norma?", "es para mi hija"]));
    expect(sent.messages).toHaveLength(1);
    if (on) {
      expect(outcomes[1]).toMatch(/^replied_product/);
      expect(sent.classified).toEqual(["Tienes el cuaderno Norma?"]);
    } else {
      expect(outcomes[1]).toBe("escalated_no_match");
      expect(sent.messages).toEqual([NO_MATCH]);
    }
    record("pregunta + relleno", on, sent.messages.length, outcomes[1]);
  });

  it("«hablar con paula» escrito + «hola»: ráfaga le avisa que Paula escribe; el actual saluda", async () => {
    const { TALK_TO_OWNER_ACKNOWLEDGEMENT } = await import("@/lib/whatsapp/bot-acknowledgements");
    const { formatBotReply } = await import("@/lib/whatsapp/bot-matching");
    const chat = await conversation();
    const outcomes = await answerAll(chat, await burst(chat.id, ["hablar con paula", "hola"]));
    expect(sent.messages).toHaveLength(1);
    if (on) {
      expect(outcomes[1]).toBe("escalated_owner_requested");
      expect(sent.messages).toEqual([formatBotReply(TALK_TO_OWNER_ACKNOWLEDGEMENT)]);
      await expect(testPrisma.conversation.findUniqueOrThrow({ where: { id: chat.id }, select: { status: true } })).resolves.toEqual({ status: "NEEDS_OWNER" });
    } else {
      expect(outcomes[1]).not.toBe("escalated_owner_requested");
    }
    record("pedir a Paula + saludo", on, sent.messages.length, outcomes[1]);
  });

  it("dos productos en dos líneas: ráfaga los pregunta juntos", async () => {
    const chat = await conversation();
    const outcomes = await answerAll(chat, await burst(chat.id, ["Tienes cuaderno Norma?", "y tienes lapiceros de gel?"]));
    expect(sent.messages).toHaveLength(1);
    expect(outcomes[1]).toMatch(/^replied_product/);
    expect(sent.classified).toEqual([on ? "Tienes cuaderno Norma? y tienes lapiceros de gel?" : "y tienes lapiceros de gel?"]);
    record("dos productos en dos líneas", on, sent.messages.length, outcomes[1]);
  });

  it("«sí» + «y también 2 lapiceros»: ráfaga arma un pedido con los dos", async () => {
    const chat = await conversation();
    await withOffer(chat.id);
    const outcomes = await answerAll(chat, await burst(chat.id, ["sí", "y también 2 lapiceros"]));
    expect(sent.messages).toHaveLength(1);
    const orders = await testPrisma.conversationMessage.findMany({ where: { conversationId: chat.id, metadata: { path: "$.orderRequest.status", equals: "pending" } }, select: { metadata: true } });
    if (on) {
      expect(outcomes[1]).toBe("replied_order_request");
      expect((orders[0].metadata as { orderRequest: { items: unknown[] } }).orderRequest.items).toHaveLength(2);
    } else {
      expect(orders).toHaveLength(0);
    }
    record("«sí» + «y también 2 lapiceros»", on, sent.messages.length, outcomes[1]);
  });

  it("ráfaga con otro mensaje esperando en la fila: no sale nada hasta el último", async () => {
    const chat = await conversation();
    const lines = await burst(chat.id, ["Hola", "Tienes el cuaderno Norma?"]);
    const own = await queuedEvent(chat.phone, "Tienes el cuaderno Norma?", true);
    const event = await queuedEvent(chat.phone, "es para mi hija");
    const first = await answer(chat, lines[1], { eventId: own.id, eventCreatedAt: own.createdAt, customerPhone: chat.phone });
    expect(sent.messages).toHaveLength(0);
    await testPrisma.marketplaceWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), status: "PROCESSED" } });
    const [last] = await burst(chat.id, ["es para mi hija"]);
    const second = await answer(chat, last);
    expect(sent.messages).toHaveLength(1);
    expect(second.outcome).toBe(on ? "replied_product" : "escalated_no_match");
    record("con un mensaje en la fila", on, sent.messages.length, `${first.outcome} → ${second.outcome}`);
  });

  it("ráfaga con Paula en la conversación: nada", async () => {
    const chat = await conversation({ lastOwnerAt: new Date(Date.now() - 60 * SECOND) });
    const outcomes = await answerAll(chat, await burst(chat.id, ["Hola", "Tienes el cuaderno Norma?"]));
    expect(sent.messages).toHaveLength(0);
    expect(outcomes.at(-1)).toBe("skipped_owner_active");
    record("Paula en la conversación", on, 0, outcomes.at(-1)!);
  });

  it("ráfaga después de pasar a Paula: nada", async () => {
    const chat = await conversation({ status: "NEEDS_OWNER" });
    const outcomes = await answerAll(chat, await burst(chat.id, ["Hola", "Tienes el cuaderno Norma?", "gracias"]));
    expect(sent.messages).toHaveLength(0);
    expect(outcomes.at(-1)).toBe("skipped_needs_owner");
    record("ya era de Paula", on, 0, outcomes.at(-1)!);
  });

  it("7 mensajes: se leen los 6 últimos", async () => {
    const chat = await conversation();
    const outcomes = await answerAll(chat, await burst(chat.id, ["Tienes agendas?", "Tienes el cuaderno Norma?", "ok", "listo", "bueno", "dale", "gracias"]));
    expect(sent.messages).toHaveLength(1);
    if (on) expect(sent.classified).toEqual(["Tienes el cuaderno Norma?"]);
    else expect(sent.messages).toEqual([NO_MATCH]);
    record("7 mensajes (tope 6)", on, sent.messages.length, outcomes.at(-1)!);
  });

  it("mensaje editado en medio de la ráfaga: se lee el texto nuevo", async () => {
    const chat = await conversation();
    const [question] = await burst(chat.id, ["Tienes el cuaderno Nroma?"]);
    await testPrisma.conversationMessage.create({
      data: { conversationId: chat.id, direction: "INBOUND", sentBy: "CUSTOMER", body: null, mediaType: "edit", createdAt: new Date(Date.now() + 2 * SECOND), externalId: `wamid.ed-${randomUUID()}`, metadata: { edit: { of: question.externalId, text: "Tienes el cuaderno Norma?" } } as never },
    });
    const [thanks] = await burst(chat.id, ["gracias"]);
    const late = { ...thanks, at: new Date(Date.now() + 4 * SECOND) };
    await testPrisma.conversationMessage.update({ where: { id: thanks.id }, data: { createdAt: late.at } });
    const outcomes = [(await answer(chat, question)).outcome, (await answer(chat, late)).outcome];
    expect(outcomes[0]).toBe("skipped_superseded");
    expect(sent.messages).toHaveLength(1);
    if (on) expect(sent.classified).toEqual(["Tienes el cuaderno Norma?"]);
    else expect(sent.messages).toEqual([NO_MATCH]);
    record("editado en medio", on, sent.messages.length, outcomes[1]);
  });

  it("pregunta y luego solo su edición: ráfaga contesta la edición; el actual se queda callado", async () => {
    const chat = await conversation();
    const [question] = await burst(chat.id, ["Tienes el cuaderno Nroma?"]);
    const editAt = new Date(Date.now() + 2 * SECOND);
    const editId = `wamid.ed-${randomUUID()}`;
    await testPrisma.conversationMessage.create({
      data: { conversationId: chat.id, direction: "INBOUND", sentBy: "CUSTOMER", body: null, mediaType: "edit", createdAt: editAt, externalId: editId, metadata: { edit: { of: question.externalId, text: "Tienes el cuaderno Norma?" } } as never },
    });
    const first = await answer(chat, question);
    // conversation-sync solo le pasa la edición al bot con el modo ráfaga encendido.
    const second = on ? await answer(chat, { body: "Tienes el cuaderno Norma?", at: editAt, externalId: editId, id: "" }, { burstEdit: true }) : null;
    expect(first.outcome).toBe("skipped_superseded");
    expect(sent.messages).toHaveLength(on ? 1 : 0);
    if (on) expect(sent.classified).toEqual(["Tienes el cuaderno Norma?"]);
    record("solo la edición", on, sent.messages.length, second?.outcome ?? "(la edición no llega al bot)");
  });

  it("interruptor del bot apagado: nada", async () => {
    await setSettings(on, { botEnabled: false });
    const chat = await conversation();
    const outcomes = await answerAll(chat, await burst(chat.id, ["Hola", "Tienes el cuaderno Norma?"]));
    expect(sent.messages).toHaveLength(0);
    expect(outcomes.at(-1)).toBe("skipped_bot_disabled");
    record("bot apagado", on, 0, outcomes.at(-1)!);
  });

  it("dos corridas a la vez con el último mensaje: un solo envío", async () => {
    const chat = await conversation();
    const lines = await burst(chat.id, ["Hola", "Tienes el cuaderno Norma?"]);
    const outcomes = await Promise.all([answer(chat, lines[1]), answer(chat, lines[1])]);
    expect(sent.messages).toHaveLength(1);
    record("dos corridas a la vez", on, sent.messages.length, outcomes.map((result) => result.outcome).sort().join(" + "));
  });

  it("dos mensajes distintos procesados a la vez: un solo envío, y contesta el último", async () => {
    const chat = await conversation();
    const [first] = await burst(chat.id, ["Hola"]);
    let second: Promise<{ outcome: string }> | null = null;
    // Cuando la primera corrida ya tiene el turno (llegó a «escribiendo…»), entra el segundo mensaje.
    sent.onTyping = async () => {
      const [line] = await burst(chat.id, ["Tienes el cuaderno Norma?"]);
      const later = { ...line, at: new Date(Date.now() + SECOND) };
      await testPrisma.conversationMessage.update({ where: { id: line.id }, data: { createdAt: later.at } });
      second = answer(chat, later);
    };
    const firstResult = await answer(chat, first);
    const secondResult = await second!;
    expect(sent.messages).toHaveLength(1);
    expect(sent.classified.at(-1)).toBe("Tienes el cuaderno Norma?");
    expect(secondResult.outcome).toBe("replied_product");
    expect((await testPrisma.conversation.findUniqueOrThrow({ where: { id: chat.id }, select: { botLeaseUntil: true } })).botLeaseUntil).toBeNull();
    record("dos mensajes a la vez", on, sent.messages.length, `${firstResult.outcome} + ${secondResult.outcome}`);
  });

  it("la misma corrida manda sus dos mensajes («Dame un segundito» y la respuesta)", async () => {
    const { PRODUCT_CLASSIFIER_SLOW_NOTICE_MS } = await import("@/lib/whatsapp/bot-products");
    sent.classifierDelayMs = PRODUCT_CLASSIFIER_SLOW_NOTICE_MS + 500;
    const chat = await conversation();
    const [line] = await burst(chat.id, ["Tienes el cuaderno Norma?"]);
    const result = await answer(chat, line);
    expect(result.outcome).toBe("replied_product");
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0]).toContain("Dame un segundito");
    record("misma corrida, 2 mensajes", on, sent.messages.length, result.outcome);
  });

  it("turno de una corrida caída: se espera a que venza y se contesta", async () => {
    const chat = await conversation();
    await testPrisma.conversation.update({ where: { id: chat.id }, data: { botLeaseUntil: new Date(Date.now() + 3 * SECOND) } });
    const [line] = await burst(chat.id, ["Tienes el cuaderno Norma?"]);
    const started = Date.now();
    const result = await answer(chat, line);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2 * SECOND);
    expect(result.outcome).toBe("replied_product");
    expect(sent.messages).toHaveLength(1);
    record("turno caído que vence pronto", on, sent.messages.length, result.outcome);
  });

  it("turno caído que no vence a tiempo: se reprograma por la fila y la segunda vuelta contesta una sola vez", async () => {
    const chat = await conversation();
    await testPrisma.conversation.update({ where: { id: chat.id }, data: { botLeaseUntil: new Date(Date.now() + 45 * SECOND) } });
    const [line] = await burst(chat.id, ["Tienes el cuaderno Norma?"]);
    // La entrega ya gastó casi todo su presupuesto: no alcanza a esperar 45 s.
    const deferred = await answer(chat, line, { jobStartedAt: new Date(Date.now() - 37 * SECOND) });
    expect(deferred.outcome).toBe("deferred_lease_held");
    expect(sent.messages).toHaveLength(0);
    expect(sent.reruns).toHaveLength(1);
    expect(sent.reruns[0].rerun).toMatchObject({ conversationId: chat.id, messageId: line.id, attempt: 1 });
    expect(sent.reruns[0].delaySeconds).toBeGreaterThan(44);
    expect(await testPrisma.conversation.findUniqueOrThrow({ where: { id: chat.id }, select: { status: true } })).toEqual({ status: "OPEN" });

    await testPrisma.conversation.update({ where: { id: chat.id }, data: { botLeaseUntil: new Date(Date.now() - SECOND) } });
    const { rerunWhatsAppBot } = await import("@/lib/whatsapp/conversation-sync");
    const rerun = await rerunWhatsAppBot(sent.reruns[0].rerun);
    expect(rerun).toEqual({ rerun: true, outcome: "replied_product" });
    expect(await rerunWhatsAppBot(sent.reruns[0].rerun)).toEqual({ rerun: false, reason: "stale" });
    expect(sent.messages).toHaveLength(1);
    record("turno caído, reprogramado", on, sent.messages.length, `${deferred.outcome} → ${rerun.outcome}`);
  });

  it("el modo sombra guarda la decisión de ráfaga, sin texto", async () => {
    const chat = await conversation();
    const lines = await burst(chat.id, ["Tienes el cuaderno Norma?", "es para mi hija"]);
    const outcomes = await answerAll(chat, lines);
    const { runWhatsAppBotShadow } = await import("@/lib/whatsapp/shadow/run");
    await runWhatsAppBotShadow(
      { conversationId: chat.id, body: lines[1].body, interactiveReplyId: null, inboundMessageId: lines[1].externalId, eventId: "evt", eventCreatedAt: new Date(), customerPhone: chat.phone, customerBsuid: null },
      outcomes[1],
      new Date(),
      { noMatchText: NO_MATCH },
    );
    const row = await testPrisma.whatsAppBotShadowRun.findFirstOrThrow({ where: { conversationId: chat.id }, select: { burstDecision: true } });
    expect(row.burstDecision).toEqual({
      mode: on ? "applied" : "shadow",
      size: 2,
      chars: 40,
      chosenIntent: "product",
      chosenPosition: 1,
      lastIntent: "filler",
      intents: ["product", "filler"],
      differs: true,
    });
    expect(JSON.stringify(row.burstDecision)).not.toMatch(/cuaderno|hija/i);
  });
});

describe("turno de envío", () => {
  it("solo quien lo tiene lo suelta; otra corrida no lo toca", async () => {
    const { claimBotLease, newBotLease, releaseBotLease } = await import("@/lib/whatsapp/bot-lease");
    const chat = await conversation();
    const holder = newBotLease();
    const other = newBotLease();
    expect(await claimBotLease(chat.id, holder)).toBe(true);
    expect(await claimBotLease(chat.id, other)).toBe(false);
    other.token = new Date(holder.token!.getTime() + 1);
    expect(await releaseBotLease(chat.id, other)).toBe(false);
    const held = await testPrisma.conversation.findUniqueOrThrow({ where: { id: chat.id }, select: { botLeaseUntil: true } });
    expect(held.botLeaseUntil?.getTime()).toBe(holder.token!.getTime());
    const first = holder.token!.getTime();
    expect(await claimBotLease(chat.id, holder)).toBe(true);
    expect(holder.token!.getTime()).toBeGreaterThanOrEqual(first - 1000);
    expect(await releaseBotLease(chat.id, holder)).toBe(true);
    expect((await testPrisma.conversation.findUniqueOrThrow({ where: { id: chat.id }, select: { botLeaseUntil: true } })).botLeaseUntil).toBeNull();
  });
});

describe("textos aprobados", () => {
  it("las huellas de los textos del bot no cambian", async () => {
    const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
    const { PRODUCT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-products");
    const { ORDER_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-order-request");
    expect([BUSINESS_FACT_TEMPLATES_VERSION, PRODUCT_TEMPLATES_VERSION, ORDER_TEMPLATES_VERSION]).toEqual([
      "493534d795d3db094db50c6717bd37d8",
      "f7db37562caa73ca426b786d7d0bc4c9",
      "8898b8057694e3cd3ef9685f8606c997",
    ]);
  });
});
