import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * «Sí» a un producto que ofreció el bot (lib/whatsapp/bot-order-request.ts),
 * con el bot real, la base local y el envío a WhatsApp simulado. Cada caso
 * cuenta los mensajes que salieron: más de lo esperado o un duplicado es un
 * error. Datos sintéticos.
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

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

const KEYWORDS = [
  { id: "kw-saludo", label: "Saludo", triggers: ["hola", "buenas"], answer: "¡Hola! 💛 ¿En qué te ayudo?" },
  { id: "kw-gracias", label: "Cortesía", triggers: ["gracias"], answer: "¡Con gusto! 💛" },
];
const OFFER = "Sí 💛 Tengo Cuaderno Argollado Norma 5 Materias en $33.000. ¿Lo quieres?";
const MINUTE = 60_000;

let fixture: InventoryFixture;
let cuadernoId = "";
let lapiceroId = "";
let siliconaIds: string[] = [];

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
  const conversation = await testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { phone: true } });
  return runWhatsAppBot({
    conversationId,
    recipient: conversation.phone!,
    body: message.body,
    inboundAt: message.at,
    inboundMessageId: message.externalId,
    skipHumanPause: true,
    keywords: KEYWORDS,
  });
}

async function state(conversationId: string) {
  const [conversation, orders] = await Promise.all([
    testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { status: true } }),
    testPrisma.conversationMessage.findMany({
      where: { conversationId, metadata: { path: "$.orderRequest.status", equals: "pending" } },
      orderBy: { createdAt: "asc" },
      select: { metadata: true, sentBy: true, body: true },
    }),
  ]);
  return {
    status: conversation.status,
    orders: orders.length,
    cardsOn: orders.map((order) => `${order.sentBy}:${order.body}`),
    lastItems: (orders.at(-1)?.metadata as { orderRequest?: { items: { name: string; quantity: number; unitPrice: number; stockConfirmed: boolean }[] } } | null)?.orderRequest?.items ?? [],
  };
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
  const store = fixture.store.id;
  const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } });
  const product = (name: string, price: number, stock: number) =>
    testPrisma.product.create({
      data: { storeId: store, categoryId: fixture.category.id, ...attributes, name, description: "Sintético", slug: `prueba-${randomUUID().slice(0, 8)}`, price, stock, sku: `SIM-${randomUUID().slice(0, 6)}` } as never,
    });
  cuadernoId = (await product("Cuaderno Argollado Norma 5 Materias", 33000, 5)).id;
  lapiceroId = (await product("Lapicero gel negro Prueba", 3500, 40)).id;
  await product("Cuaderno cuadriculado Prueba", 9000, 10);
  siliconaIds = [
    (await product("Silicona líquida Prueba", 6000, 8)).id,
    (await product("Pistola de silicona Prueba", 18000, 3)).id,
    (await product("Simón dice Prueba", 25000, 2)).id,
  ];
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

describe("pedido por WhatsApp: «sí» al producto ofrecido", () => {
  it("sin la aprobación de Paula todo sigue como hoy", async () => {
    await setApprovals(false);
    const id = await withOffer();
    const result = await answer(id, await inbound(id, "sí"));
    expect(result.outcome).toBe("escalated_no_match");
    expect(sent.messages).toEqual(["Esa no me la sé 💛 Le paso tu mensaje a Paula y ella te escribe apenas pueda."]);
    expect(await state(id)).toMatchObject({ status: "NEEDS_OWNER", orders: 0 });
  });

  it("apagado, la sombra anota lo que habría hecho el pedido (sin IA)", async () => {
    await setApprovals(false);
    const id = await withOffer();
    const message = await inbound(id, "sí");
    const result = await answer(id, message);
    const { runWhatsAppBotShadow } = await import("@/lib/whatsapp/shadow/run");
    await runWhatsAppBotShadow(
      { conversationId: id, body: "sí", interactiveReplyId: null, inboundMessageId: message.externalId, eventId: "ev-sim", eventCreatedAt: new Date(), customerPhone: null, customerBsuid: null },
      result.outcome,
      new Date(),
      { noMatchText: "Esa no me la sé 💛 Le paso tu mensaje a Paula y ella te escribe apenas pueda." },
    );
    const row = await testPrisma.whatsAppBotShadowRun.findFirstOrThrow({ where: { conversationId: id } });
    expect(row).toMatchObject({ intent: "order_request", plannedTypes: ["order_request"], realOutcome: "escalated_no_match", classifierStatus: "skipped" });
    await testPrisma.whatsAppBotShadowRun.deleteMany({ where: { conversationId: id } });
  });

  it("«sí»: un mensaje, pasa a Paula y queda el pedido con el precio de la base", async () => {
    const id = await withOffer();
    expect((await answer(id, await inbound(id, "sí"))).outcome).toBe("replied_order_request");
    expect(sent.messages).toEqual([
      "¡Listo! 💛 Le paso tu pedido a Paula: Cuaderno Argollado Norma 5 Materias × 1, total $33.000 (sin envío). Ella te escribe para confirmar envío y pago.",
    ]);
    expect(await state(id)).toEqual({
      status: "NEEDS_OWNER",
      orders: 1,
      cardsOn: [expect.stringMatching(/^BOT:¡Listo! 💛 Le paso tu pedido a Paula/)],
      lastItems: [expect.objectContaining({ name: "Cuaderno Argollado Norma 5 Materias", quantity: 1, unitPrice: 33000, stockConfirmed: true })],
    });
  });

  it("«sí, 2» lleva la cantidad", async () => {
    const id = await withOffer();
    await answer(id, await inbound(id, "sí, 2"));
    expect(sent.messages[0]).toContain("× 2, total $66.000 (sin envío)");
    expect((await state(id)).lastItems[0]).toMatchObject({ quantity: 2, stockConfirmed: true });
  });

  it("más de lo que hay no se promete: Paula confirma la cantidad", async () => {
    const id = await withOffer();
    await answer(id, await inbound(id, "quiero 30"));
    expect(sent.messages).toEqual(["Le paso tu pedido a Paula 💛 Cuaderno Argollado Norma 5 Materias × 30. Ella te confirma si tenemos esa cantidad, el envío y el pago."]);
    expect((await state(id)).lastItems[0]).toMatchObject({ quantity: 30, stockConfirmed: false });
  });

  it("«sí, y también quiero 2 lapiceros»: suma el lapicero porque es el único que hay", async () => {
    const id = await withOffer();
    await answer(id, await inbound(id, "sí, y también quiero 2 lapiceros"));
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0]).toContain("• Cuaderno Argollado Norma 5 Materias × 1: $33.000\n• Lapicero gel negro Prueba × 2: $7.000\nTotal: $40.000 (sin envío)");
    expect((await state(id)).lastItems.map((item) => item.name)).toEqual(["Cuaderno Argollado Norma 5 Materias", "Lapicero gel negro Prueba"]);
  });

  it("ya pasado a Paula: suma un producto inequívoco y no adivina uno ambiguo", async () => {
    const id = await withOffer();
    await answer(id, await inbound(id, "sí"));
    sent.messages.length = 0;
    expect((await answer(id, await inbound(id, "y también 2 lapiceros"))).outcome).toBe("replied_order_appended");
    expect(sent.messages).toEqual(["Lo sumo a tu pedido 💛 Va así:\n• Cuaderno Argollado Norma 5 Materias × 1: $33.000\n• Lapicero gel negro Prueba × 2: $7.000\nTotal: $40.000 (sin envío)\nPaula te escribe para confirmar envío y pago."]);
    sent.messages.length = 0;
    expect((await answer(id, await inbound(id, "también un cuaderno"))).outcome).toBe("skipped_needs_owner");
    expect(sent.messages).toEqual([]);
    expect((await state(id)).status).toBe("NEEDS_OWNER");
  });

  it("«sí» dos veces: el segundo no manda nada ni crea otro pedido", async () => {
    const id = await withOffer();
    await answer(id, await inbound(id, "sí"));
    await answer(id, await inbound(id, "sí"));
    expect(sent.messages).toHaveLength(1);
    expect((await state(id)).orders).toBe(1);
  });

  it("ráfaga «sí», «dale», «si porfa»: contesta una vez, al último", async () => {
    const id = await withOffer();
    const base = Date.now();
    const burst = [await inbound(id, "sí", new Date(base)), await inbound(id, "dale", new Date(base + 1000)), await inbound(id, "si porfa", new Date(base + 2000))];
    const outcomes = [];
    for (const message of burst) outcomes.push((await answer(id, message)).outcome);
    expect(outcomes).toEqual(["skipped_superseded", "skipped_superseded", "replied_order_request"]);
    expect(sent.messages).toHaveLength(1);
    expect((await state(id)).orders).toBe(1);
  });

  it("toque o mensaje nuevo mientras se prepara la respuesta: no sale nada", async () => {
    const id = await withOffer();
    sent.onTyping = async () => {
      sent.onTyping = null;
      await inbound(id, "Hablar con Paula", new Date(Date.now() + 500));
    };
    const yes = await inbound(id, "sí");
    expect((await answer(id, yes)).outcome).toBe("skipped_superseded");
    expect(sent.messages).toEqual([]);
    // La respuesta no salió, pero el pedido queda en el mensaje de la clienta y la conversación es de Paula.
    expect(await state(id)).toMatchObject({ status: "NEEDS_OWNER", orders: 1, cardsOn: ["CUSTOMER:sí"] });
    expect((await state(id)).lastItems).toEqual([{ productId: cuadernoId, name: "Cuaderno Argollado Norma 5 Materias", quantity: 1, unitPrice: 33000, stockConfirmed: true }]);
  });

  it("después de un envío cortado: reintento, otro «sí» o el bot devuelto no duplican la tarjeta", async () => {
    const id = await withOffer();
    sent.onTyping = async () => {
      sent.onTyping = null;
      await inbound(id, "Hablar con Paula", new Date(Date.now() + 500));
    };
    const yes = await inbound(id, "sí");
    await answer(id, yes);
    await answer(id, yes);
    await answer(id, await inbound(id, "sí", new Date(Date.now() + 1000)));
    expect(sent.messages).toEqual([]);
    expect(await state(id)).toMatchObject({ status: "NEEDS_OWNER", orders: 1, cardsOn: ["CUSTOMER:sí"] });
    // Paula la devuelve al bot y la clienta repite el «sí» a la misma oferta.
    await testPrisma.conversation.update({ where: { id }, data: { status: "OPEN" } });
    expect((await answer(id, await inbound(id, "sí", new Date(Date.now() + 2000)))).outcome).not.toBe("replied_order_request");
    expect((await state(id)).orders).toBe(1);
  });

  it("agregar cortado por un toque: queda la tarjeta con todo y no sale nada; repetirlo no la duplica", async () => {
    const id = await withOffer();
    await answer(id, await inbound(id, "sí"));
    sent.messages.length = 0;
    sent.onTyping = async () => {
      sent.onTyping = null;
      await inbound(id, "Hablar con Paula", new Date(Date.now() + 500));
    };
    expect((await answer(id, await inbound(id, "y también 2 lapiceros"))).outcome).toBe("skipped_superseded");
    expect(sent.messages).toEqual([]);
    const after = await state(id);
    expect(after.cardsOn.at(-1)).toBe("CUSTOMER:y también 2 lapiceros");
    expect(after.lastItems.map((item) => `${item.name} × ${item.quantity}`)).toEqual(["Cuaderno Argollado Norma 5 Materias × 1", "Lapicero gel negro Prueba × 2"]);
    await answer(id, await inbound(id, "y también 2 lapiceros", new Date(Date.now() + 1000)));
    expect(sent.messages).toEqual([]);
    expect((await state(id)).orders).toBe(after.orders);
  });

  it("«Descartar» apaga también la tarjeta guardada en el mensaje de la clienta", async () => {
    const id = await withOffer();
    sent.onTyping = async () => {
      sent.onTyping = null;
      await inbound(id, "Hablar con Paula", new Date(Date.now() + 500));
    };
    await answer(id, await inbound(id, "sí"));
    expect((await state(id)).orders).toBe(1);
    session.userId = fixture.store.userId;
    const { DELETE } = await import("@/app/api/[storeId]/conversations/[conversationId]/order-request/route");
    const response = await DELETE(new Request("http://test.local"), { params: { storeId: fixture.store.id, conversationId: id } });
    session.userId = null;
    expect(await response.json()).toEqual({ dismissed: 1 });
    expect((await state(id)).orders).toBe(0);
  });

  it("con Paula activa en la conversación o en su pausa: silencio", async () => {
    for (const ownerAgo of [5 * MINUTE, 3 * 60 * MINUTE]) {
      const id = await withOffer();
      await testPrisma.conversation.update({ where: { id }, data: { lastOwnerAt: new Date(Date.now() - ownerAgo) } });
      expect((await answer(id, await inbound(id, "sí"))).outcome).toBe("skipped_owner_active");
    }
    expect(sent.messages).toEqual([]);
  });

  it("con el interruptor apagado: silencio", async () => {
    await setApprovals(true, { botEnabled: false });
    const id = await withOffer();
    expect((await answer(id, await inbound(id, "sí"))).outcome).toBe("skipped_bot_disabled");
    expect(sent.messages).toEqual([]);
  });

  it("oferta de hace más de 30 minutos o de varios productos: no es pedido", async () => {
    const stale = await withOffer({ offerAgo: 31 * MINUTE });
    await answer(stale, await inbound(stale, "sí"));
    const list = await withOffer({ offer: "Sí, mira 💛 Tengo estos:\n• A\n• B\n¿Cuál te interesa?", ids: [cuadernoId, lapiceroId] });
    await answer(list, await inbound(list, "sí"));
    expect(sent.messages.every((text) => text.startsWith("Esa no me la sé"))).toBe(true);
    expect((await state(stale)).orders + (await state(list)).orders).toBe(0);
  });

  it("al tope de 4 mensajes en 10 minutos: no sale nada", async () => {
    const id = await withOffer();
    for (let index = 0; index < 4; index += 1) {
      await testPrisma.conversationMessage.create({
        data: { conversationId: id, direction: "OUTBOUND", sentBy: "BOT", status: "SENT", body: `relleno ${index}`, createdAt: new Date(Date.now() - (index + 1) * 10_000), externalId: `wamid.out-${randomUUID()}`, metadata: { shown: { ids: [cuadernoId] } } as never },
      });
    }
    await testPrisma.conversationMessage.updateMany({ where: { conversationId: id, body: "relleno 0" }, data: { body: OFFER } });
    await answer(id, await inbound(id, "sí"));
    expect(sent.messages).toEqual([]);
  });

  it("«¿cuánto es el envío?» contesta con los ajustes y pasa a Paula; sin ellos, lo genérico", async () => {
    const id = await withOffer();
    expect((await answer(id, await inbound(id, "sí, ¿cuánto es el envío?"))).outcome).toBe("replied_shipping_quote");
    expect(sent.messages).toEqual([
      "El valor del envío depende de tu ciudad y lo cotiza la transportadora 💛 Desde $250.000 en productos el envío es gratis. Normalmente llega en 2 a 6 días hábiles. Paula te confirma el valor exacto.",
    ]);
    expect(await state(id)).toMatchObject({ status: "NEEDS_OWNER", orders: 0 });
    sent.messages.length = 0;
    await setApprovals(true, { deliveryEstimate: null }, null);
    const other = await withOffer();
    await answer(other, await inbound(other, "cuánto cuesta el domicilio?"));
    expect(sent.messages).toEqual(["El valor del envío depende de tu ciudad y lo cotiza la transportadora 💛 Paula te confirma el valor exacto."]);
  });

  it("«sí» o «si porfa» ante una lista con siliconas no contesta de la silicona; «sí, la pistola» sí", async () => {
    const list = "Mira 💛 Tengo estos:\n• Silicona líquida Prueba\n• Pistola de silicona Prueba\n• Simón dice Prueba\n¿Cuál te interesa?";
    for (const body of ["sí", "si porfa"]) {
      const id = await withOffer({ offer: list, ids: siliconaIds });
      await answer(id, await inbound(id, body));
    }
    expect(sent.messages.some((text) => /Silicona|Pistola|Simón/.test(text))).toBe(false);
    sent.messages.length = 0;
    const id = await withOffer({ offer: list, ids: siliconaIds });
    await answer(id, await inbound(id, "sí, la pistola"));
    expect(sent.messages).toHaveLength(1);
    expect(sent.messages[0]).toContain("Pistola de silicona Prueba");
  });

  it("precio con centavos: el subtotal es la cantidad por el precio que enseñó la oferta", async () => {
    const store = fixture.store.id;
    const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } });
    const borrador = await testPrisma.product.create({
      data: { storeId: store, categoryId: fixture.category.id, ...attributes, name: "Borrador nata Prueba", description: "Sintético", slug: `prueba-${randomUUID().slice(0, 8)}`, price: 3499.6, stock: 9, sku: `SIM-${randomUUID().slice(0, 6)}` } as never,
    });
    const { answerAboutProduct } = await import("@/lib/whatsapp/bot-products");
    const offer = (await answerAboutProduct(store, borrador.id, "product.search"))!.text;
    expect(offer).toBe("Sí 💛 Tengo Borrador nata Prueba en $3.500. ¿Lo quieres?");
    const id = await withOffer({ offer, ids: [borrador.id] });
    await answer(id, await inbound(id, "sí, 3"));
    expect(sent.messages).toEqual(["¡Listo! 💛 Le paso tu pedido a Paula: Borrador nata Prueba × 3, total $10.500 (sin envío). Ella te escribe para confirmar envío y pago."]);
    expect((await state(id)).lastItems).toEqual([expect.objectContaining({ unitPrice: 3500, quantity: 3 })]);
  });
});
