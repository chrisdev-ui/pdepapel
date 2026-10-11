import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Mensajes que llegan con el texto de un botón de la tienda web
 * (lib/whatsapp/web-origin.ts), con el bot real, la base local y el envío a
 * WhatsApp simulado. Cada caso cuenta los mensajes que salieron. Datos sintéticos.
 */
const sent = vi.hoisted(() => ({ messages: [] as string[], onTyping: null as null | (() => Promise<void>) }));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value !== "function" || !name.startsWith("sendWhatsApp")) continue;
    stubs[name] = async (_to: unknown, body: unknown) => {
      if (name === "sendWhatsAppTypingIndicator") {
        await sent.onTyping?.();
      } else {
        sent.messages.push(typeof body === "string" ? body : JSON.stringify(body));
      }
      return { ok: true, messageId: `wamid.sim-${randomUUID()}` };
    };
  }
  return stubs;
});

const KEYWORDS = [
  { id: "kw-saludo", label: "Saludo", triggers: ["hola", "buenas"], answer: "¡Hola! 💛 ¿En qué te ayudo?" },
  { id: "kw-gracias", label: "Cortesía", triggers: ["gracias"], answer: "¡Con gusto! 💛" },
];
const OFFER = "Sí 💛 Tengo Cuaderno Argollado Norma 5 Materias en $33.000. ¿Lo quieres?";
const MINUTE = 60_000;

let fixture: InventoryFixture;
let cuadernoId = "";
let lapiceroId = "";
let cuadernoSku = "";
let agotadoSku = "";

async function setApprovals(orders: boolean, extra: Record<string, unknown> = {}, freeShippingThreshold: number | null = 250000) {
  // El umbral de envío gratis sale de la tienda, el mismo que usa el checkout.
  await testPrisma.store.update({ where: { id: fixture.store.id }, data: { freeShippingThreshold } });
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const { PRODUCT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-products");
  const { ORDER_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-order-request");
  await testPrisma.storeSettings.update({
    where: { storeId: fixture.store.id },
    data: {
      botEnabled: true,
      deliveryEstimate: "2 a 6 días hábiles",
      botFactsApprovedAt: new Date(),
      botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
      botProductsApprovedAt: new Date(),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
      botCasualApprovedAt: orders ? new Date() : null,
      botCasualVersion: orders ? ORDER_TEMPLATES_VERSION : null,
      ...extra,
    },
  });
}

/** Una conversación nueva, vacía. */
async function fresh() {
  const conversation = await testPrisma.conversation.create({
    data: { storeId: fixture.store.id, phone: `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, status: "OPEN" },
  });
  return conversation.id;
}

/** Una conversación nueva en la que el bot ofreció el cuaderno `offerAgo` atrás. */
async function withOffer({ offerAgo = MINUTE, offer = OFFER, ids = [cuadernoId] }: { offerAgo?: number; offer?: string; ids?: string[] } = {}) {
  const now = Date.now();
  const conversation = await testPrisma.conversation.create({
    data: { storeId: fixture.store.id, phone: `57300${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, status: "OPEN", lastInboundAt: new Date(now - offerAgo - 5_000) },
  });
  await testPrisma.conversationMessage.create({
    data: { conversationId: conversation.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "tienen cuadernos argollados?", createdAt: new Date(now - offerAgo - 5_000), externalId: `wamid.in-${randomUUID()}` },
  });
  await testPrisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sentBy: "BOT",
      status: "SENT",
      body: offer,
      createdAt: new Date(now - offerAgo),
      externalId: `wamid.out-${randomUUID()}`,
      metadata: { shown: { ids, intent: "product.search" } } as never,
    },
  });
  return conversation.id;
}

async function inbound(conversationId: string, body: string, at = new Date()) {
  const externalId = `wamid.in-${randomUUID()}`;
  await testPrisma.conversationMessage.create({ data: { conversationId, direction: "INBOUND", sentBy: "CUSTOMER", body, createdAt: at, externalId } });
  return { body, at, externalId };
}

async function answer(conversationId: string, message: { body: string; at: Date; externalId: string }) {
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  const { detectWebOrigin } = await import("@/lib/whatsapp/web-origin");
  const conversation = await testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { phone: true } });
  return runWhatsAppBot({
    conversationId,
    recipient: conversation.phone!,
    body: message.body,
    inboundAt: message.at,
    inboundMessageId: message.externalId,
    skipHumanPause: true,
    keywords: KEYWORDS,
    webOrigin: detectWebOrigin(message.body),
  });
}

async function state(conversationId: string) {
  const [conversation, orders] = await Promise.all([
    testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { status: true } }),
    testPrisma.conversationMessage.findMany({
      where: { conversationId, sentBy: "BOT", metadata: { path: "$.orderRequest.status", equals: "pending" } },
      orderBy: { createdAt: "asc" },
      select: { metadata: true },
    }),
  ]);
  return {
    status: conversation.status,
    orders: orders.length,
    lastItems: (orders.at(-1)?.metadata as { orderRequest?: { items: { name: string; quantity: number; unitPrice: number; stockConfirmed: boolean }[] } } | null)?.orderRequest?.items ?? [],
  };
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } });
  const product = (name: string, price: number, stock: number) =>
    testPrisma.product.create({
      data: { storeId: store, categoryId: fixture.category.id, ...attributes, name, description: "Sintético", slug: `prueba-${randomUUID().slice(0, 8)}`, price, stock, sku: `PRU-WEB-${randomUUID().slice(0, 6).toUpperCase()}` } as never,
    });
  const cuaderno = await product("Cuaderno Argollado Norma 5 Materias", 33000, 5);
  cuadernoId = cuaderno.id;
  cuadernoSku = cuaderno.sku as string;
  agotadoSku = (await product("Libreta agotada Prueba", 12000, 0)).sku as string;
  lapiceroId = (await product("Lapicero gel negro Prueba", 3500, 40)).id;
  await product("Cuaderno cuadriculado Prueba", 9000, 10);
  await testPrisma.storeSettings.upsert({ where: { storeId: store }, create: { storeId: store }, update: {} });
});

beforeEach(async () => {
  sent.messages.length = 0;
  sent.onTyping = null;
  await setApprovals(true);
});

afterAll(async () => {
  const store = fixture.store.id;
  const conversations = (await testPrisma.conversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: store } });
  await testPrisma.product.deleteMany({ where: { storeId: store, description: "Sintético" } });
  await deleteInventoryFixture(fixture);
});

const WEB = {
  product: (name: string, sku: string) => `¡Hola! 👋 Vengo de la tienda web y me interesa: ${name} (ref ${sku}).`,
  cart: "¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito (ref AAA-BBB-1, CCC-DDD-2).",
  order: (n: string) => `¡Hola! 👋 Tengo una pregunta sobre mi pedido #${n} de la tienda web.`,
  general: "¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta.",
  legacy: "¡Hola! Encontré su contacto en la página web. Me gustaría consultar sobre…",
};
const GREETING = "¡Hola! 💛 Qué bueno que nos escribes desde la web.";
const GENERAL = "¡Hola! 💛 Gracias por escribirnos desde la web. Cuéntame qué producto buscas y te digo precio y disponibilidad. También te ayudo con envíos y formas de pago.";

describe("llega desde la tienda web", () => {
  it("sin la aprobación de Paula: la bienvenida de siempre, nada nuevo", async () => {
    await setApprovals(false);
    const id = await fresh();
    const result = await answer(id, await inbound(id, WEB.general));
    expect(result.outcome).not.toBe("replied_web_origin");
    expect(sent.messages.length).toBeLessThanOrEqual(1);
    expect(sent.messages.join("")).not.toContain("desde la web");
    const { runWhatsAppBotShadow } = await import("@/lib/whatsapp/shadow/run");
    const { detectWebOrigin } = await import("@/lib/whatsapp/web-origin");
    const message = await testPrisma.conversationMessage.findFirstOrThrow({ where: { conversationId: id, direction: "INBOUND" }, select: { externalId: true } });
    await runWhatsAppBotShadow(
      { conversationId: id, body: WEB.general, interactiveReplyId: null, inboundMessageId: message.externalId, eventId: "ev-sim", eventCreatedAt: new Date(), customerPhone: null, customerBsuid: null, webOrigin: detectWebOrigin(WEB.general) },
      result.outcome,
      new Date(),
      { noMatchText: "Esa no me la sé" },
    );
    const row = await testPrisma.whatsAppBotShadowRun.findFirstOrThrow({ where: { conversationId: id } });
    expect(row).toMatchObject({ intent: "web_general", plannedTypes: ["web_welcome"], classifierStatus: "skipped" });
    await testPrisma.whatsAppBotShadowRun.deleteMany({ where: { conversationId: id } });
  });

  it("producto con existencias: un mensaje con saludo y la oferta, y el «sí» pasa el pedido", async () => {
    const id = await fresh();
    expect((await answer(id, await inbound(id, WEB.product("Cuaderno Argollado Norma 5 Materias", cuadernoSku)))).outcome).toBe("replied_web_origin");
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0]).toContain(GREETING);
    expect(sent.messages[0]).toMatch(/Cuaderno Argollado Norma 5 Materias en \$33\.000\. ¿Lo quieres\?/);
    expect((await answer(id, await inbound(id, "sí"))).outcome).toBe("replied_order_request");
    expect(sent.messages).toHaveLength(2);
  });

  it("producto agotado o referencia desconocida: el saludo general", async () => {
    for (const sku of [agotadoSku, "ZZZ-NO-EXISTE-1"]) {
      sent.messages.length = 0;
      const id = await fresh();
      await answer(id, await inbound(id, WEB.product("Algo", sku)));
      expect(sent.messages).toEqual([GENERAL]);
    }
  });

  it("carrito, general y el texto viejo: un mensaje cada uno", async () => {
    for (const [text, expected] of [
      [WEB.cart, "¡Hola! 💛 Vi que vienes de tu carrito. ¿Cuál es tu duda? Te ayudo con envío, formas de pago o disponibilidad."],
      [WEB.general, GENERAL],
      [WEB.legacy, GENERAL],
    ]) {
      sent.messages.length = 0;
      const id = await fresh();
      await answer(id, await inbound(id, text));
      expect(sent.messages).toEqual([expected]);
    }
  });

  it("pedido: avisa que Paula responde, pasa a ella y nunca da el estado", async () => {
    const id = await fresh();
    await answer(id, await inbound(id, WEB.order("ORD-1700000000000-123")));
    expect(sent.messages).toEqual(["¡Hola! 💛 Recibí tu consulta sobre el pedido #ORD-1700000000000-123. Le aviso a Paula para que te responda."]);
    expect((await state(id)).status).toBe("NEEDS_OWNER");
  });

  it("texto editado (sin emoji ni tildes) se reconoce igual", async () => {
    const id = await fresh();
    await answer(id, await inbound(id, "hola vengo de la tienda web y quiero hacer una consulta"));
    expect(sent.messages).toEqual([GENERAL]);
  });

  it("con una pregunta después del texto: contesta la pregunta, no el saludo", async () => {
    const id = await fresh();
    const result = await answer(id, await inbound(id, `${WEB.general} cuánto es el envío?`));
    expect(result.outcome).toBe("replied_shipping_quote");
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0]).not.toContain("desde la web");
  });

  it("ráfaga de tres justo después del texto: un solo mensaje, al último", async () => {
    const id = await fresh();
    const base = Date.now();
    const burst = [await inbound(id, WEB.general, new Date(base)), await inbound(id, "hola", new Date(base + 800)), await inbound(id, "gracias", new Date(base + 1600))];
    const outcomes = [];
    for (const message of burst) outcomes.push((await answer(id, message)).outcome);
    expect(outcomes).toEqual(["skipped_superseded", "skipped_superseded", "replied"]);
    expect(sent.messages).toEqual(["¡Con gusto! 💛"]);
  });

  it("toque o mensaje nuevo mientras se prepara: no sale nada", async () => {
    const id = await fresh();
    sent.onTyping = async () => {
      sent.onTyping = null;
      await inbound(id, "Hablar con Paula", new Date(Date.now() + 500));
    };
    await answer(id, await inbound(id, WEB.general));
    expect(sent.messages).toEqual([]);
  });

  it("con Paula en pausa o el interruptor apagado: silencio", async () => {
    const paused = await fresh();
    await testPrisma.conversation.update({ where: { id: paused }, data: { lastOwnerAt: new Date(Date.now() - 2 * 60 * MINUTE) } });
    expect((await answer(paused, await inbound(paused, WEB.general))).outcome).toBe("skipped_owner_active");
    await setApprovals(true, { botEnabled: false });
    const off = await fresh();
    expect((await answer(off, await inbound(off, WEB.general))).outcome).toBe("skipped_bot_disabled");
    expect(sent.messages).toEqual([]);
  });

  it("el mismo día otra vez: no repite la bienvenida (ni la web ni la de siempre)", async () => {
    const id = await fresh();
    await answer(id, await inbound(id, WEB.general));
    expect((await answer(id, await inbound(id, WEB.general))).outcome).toBe("skipped_welcome_repeat");
    expect((await answer(id, await inbound(id, "hola"))).outcome).toBe("skipped_welcome_repeat");
    expect(sent.messages).toHaveLength(1);
  });
});
