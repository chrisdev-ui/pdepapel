import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El bot cotiza lo mismo que la ficha de la tienda: precio de lista, la mejor
 * oferta vigente (por producto o por grupo) o la escalera por cantidad, con el
 * cálculo del checkout (`lib/product-pricing.ts`). El pedido guarda el precio
 * que se cotizó. Bot real, base local y envío a WhatsApp simulado; datos
 * sintéticos.
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

const DAY = 24 * 60 * 60 * 1000;

let fixture: InventoryFixture;
let attributes: { colorId: string; sizeId: string; designId: string };

async function product(name: string, price: number, extra: Record<string, unknown> = {}) {
  return testPrisma.product.create({
    data: {
      storeId: fixture.store.id,
      categoryId: fixture.category.id,
      ...attributes,
      name,
      description: "Sintético",
      slug: `prueba-${randomUUID().slice(0, 8)}`,
      price,
      stock: 10,
      sku: `PRM-${randomUUID().slice(0, 6).toUpperCase()}`,
      ...extra,
    } as never,
  });
}

async function promo(
  link: { productId?: string; productGroupId?: string },
  { type = "PERCENTAGE", amount = 20, from = -DAY, to = DAY, isActive = true }: { type?: "PERCENTAGE" | "FIXED"; amount?: number; from?: number; to?: number; isActive?: boolean } = {},
) {
  const now = Date.now();
  return testPrisma.offer.create({
    data: {
      storeId: fixture.store.id,
      name: `Promo prueba ${randomUUID().slice(0, 6)}`,
      type,
      amount,
      startDate: new Date(now + from),
      endDate: new Date(now + to),
      isActive,
      ...(link.productId ? { products: { create: [{ productId: link.productId }] } } : {}),
      ...(link.productGroupId ? { productGroups: { create: [{ productGroupId: link.productGroupId }] } } : {}),
    } as never,
  });
}

async function chat() {
  return (
    await testPrisma.conversation.create({
      data: { storeId: fixture.store.id, phone: `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, status: "OPEN", lastInboundAt: new Date() },
    })
  ).id;
}

async function say(conversationId: string, body: string, at = new Date()) {
  const externalId = `wamid.in-${randomUUID()}`;
  await testPrisma.conversationMessage.create({ data: { conversationId, direction: "INBOUND", sentBy: "CUSTOMER", body, createdAt: at, externalId } });
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  const { detectWebOrigin } = await import("@/lib/whatsapp/web-origin");
  const conversation = await testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { phone: true } });
  return runWhatsAppBot({
    conversationId,
    recipient: conversation.phone!,
    body,
    inboundAt: at,
    inboundMessageId: externalId,
    skipHumanPause: true,
    keywords: [],
    webOrigin: detectWebOrigin(body),
  });
}

/** La clienta llega desde la ficha (oferta de un producto) y contesta «sí, 2». */
async function offerThenYes(item: { name: string; sku: string | null }, betweenOfferAndYes?: () => Promise<void>) {
  const id = await chat();
  await say(id, `¡Hola! 👋 Vengo de la tienda web y me interesa: ${item.name} (ref ${item.sku}).`, new Date(Date.now() - 60_000));
  const offer = sent.messages.at(-1) ?? "";
  await betweenOfferAndYes?.();
  await say(id, "sí, 2");
  const order = sent.messages.at(-1) ?? "";
  const card = await testPrisma.conversationMessage.findFirstOrThrow({
    where: { conversationId: id, metadata: { path: "$.orderRequest.status", equals: "pending" } },
    select: { metadata: true },
  });
  const items = (card.metadata as { orderRequest: { items: { unitPrice: number; quantity: number }[] } }).orderRequest.items;
  return { offer, order, items };
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
  attributes = (await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } })) as never;
  await testPrisma.storeSettings.upsert({ where: { storeId: fixture.store.id }, create: { storeId: fixture.store.id }, update: {} });
});

beforeEach(async () => {
  sent.messages.length = 0;
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const { PRODUCT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-products");
  const { ORDER_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-order-request");
  await testPrisma.storeSettings.update({
    where: { storeId: fixture.store.id },
    data: {
      botEnabled: true,
      botFactsApprovedAt: new Date(),
      botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
      botProductsApprovedAt: new Date(),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
      botCasualApprovedAt: new Date(),
      botCasualVersion: ORDER_TEMPLATES_VERSION,
    },
  });
});

afterAll(async () => {
  const store = fixture.store.id;
  const conversations = (await testPrisma.conversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  const offers = (await testPrisma.offer.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.offerProduct.deleteMany({ where: { offerId: { in: offers } } });
  await testPrisma.offerProductGroup.deleteMany({ where: { offerId: { in: offers } } });
  await testPrisma.offer.deleteMany({ where: { storeId: store } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: store } });
  await testPrisma.product.deleteMany({ where: { storeId: store, description: "Sintético" } });
  await testPrisma.productGroup.deleteMany({ where: { storeId: store } });
  await deleteInventoryFixture(fixture);
});

describe("el bot cotiza el precio de la tienda", () => {
  it("con una oferta vigente: la oferta, el «sí, 2», la tarjeta y la búsqueda dicen el precio rebajado", async () => {
    const tote = await product("Tote bag Promo Vigente", 35000);
    await promo({ productId: tote.id }, { amount: 20 });
    const { offer, order, items } = await offerThenYes(tote);
    expect(offer).toContain("Tote bag Promo Vigente en $28.000. ¿Lo quieres?");
    expect(order).toBe("¡Listo! 💛 Le paso tu pedido a Paula: Tote bag Promo Vigente × 2, total $56.000 (sin envío). Ella te escribe para confirmar envío y pago.");
    expect(items).toEqual([expect.objectContaining({ unitPrice: 28000, quantity: 2 })]);

    const { resolveProductSearch } = await import("@/lib/whatsapp/bot-products");
    const found = await resolveProductSearch(fixture.store.id, { intent: "product.search", productType: "tote bag promo vigente", character: null, descriptor: null });
    expect(found.known && found.value.matches).toEqual([{ name: "Tote bag Promo Vigente", price: 28000 }]);
  });

  it.each([
    ["vencida", { from: -3 * DAY, to: -DAY }],
    ["que todavía no empieza", { from: DAY, to: 3 * DAY }],
    ["apagada", { isActive: false }],
  ])("con una oferta %s: precio de lista", async (_label, window) => {
    const libreta = await product(`Libreta Promo ${randomUUID().slice(0, 4)}`, 20000);
    await promo({ productId: libreta.id }, { amount: 50, ...window });
    const { offer, order, items } = await offerThenYes(libreta);
    expect(offer).toContain(`${libreta.name} en $20.000. ¿Lo quieres?`);
    expect(order).toContain(`${libreta.name} × 2, total $40.000 (sin envío)`);
    expect(items[0].unitPrice).toBe(20000);
  });

  it("oferta sobre el grupo: la variante sale con el precio rebajado", async () => {
    const group = await testPrisma.productGroup.create({ data: { storeId: fixture.store.id, name: "Grupo Promo Prueba", description: "Sintético" } as never });
    const variante = await product("Cartuchera Promo Rosada", 30000, { productGroupId: group.id });
    await promo({ productGroupId: group.id }, { type: "FIXED", amount: 5000 });
    const { offer, order, items } = await offerThenYes(variante);
    expect(offer).toContain("Cartuchera Promo Rosada en $25.000.");
    expect(order).toContain("× 2, total $50.000 (sin envío)");
    expect(items[0].unitPrice).toBe(25000);
  });

  it("kit con oferta: lo mismo que cualquier producto", async () => {
    const kit = await product("Kit Promo Escolar", 50000, { isKit: true });
    await testPrisma.productKit.create({ data: { kitId: kit.id, componentId: fixture.component.id, quantity: 1 } as never });
    await promo({ productId: kit.id }, { amount: 10 });
    const { offer, order } = await offerThenYes(kit);
    expect(offer).toContain("Kit Promo Escolar en $45.000.");
    expect(order).toContain("× 2, total $90.000 (sin envío)");
    await testPrisma.productKit.deleteMany({ where: { kitId: kit.id } });
  });

  it("sin oferta: igual que antes", async () => {
    const lapiz = await product("Lápiz Sin Promo", 2500);
    const { offer, order, items } = await offerThenYes(lapiz);
    expect(offer).toContain("Lápiz Sin Promo en $2.500.");
    expect(order).toContain("× 2, total $5.000 (sin envío)");
    expect(items[0].unitPrice).toBe(2500);
  });

  it("la oferta termina entre el mensaje y el «sí»: se respeta lo cotizado", async () => {
    const agenda = await product("Agenda Promo Termina", 40000);
    const oferta = await promo({ productId: agenda.id }, { amount: 25 });
    const { offer, order, items } = await offerThenYes(agenda, async () => {
      await testPrisma.offer.update({ where: { id: oferta.id }, data: { isActive: false } });
    });
    expect(offer).toContain("Agenda Promo Termina en $30.000.");
    expect(order).toContain("× 2, total $60.000 (sin envío)");
    expect(items[0].unitPrice).toBe(30000);
  });

  it("escalera por cantidad: a esa cantidad la tienda cobra menos y el pedido también", async () => {
    const marcador = await product("Marcador Escalera Prueba", 6000);
    await testPrisma.productPriceTier.create({ data: { storeId: fixture.store.id, productId: marcador.id, minQuantity: 2, unitPrice: 5000 } as never });
    const { offer, order, items } = await offerThenYes(marcador);
    expect(offer).toContain("Marcador Escalera Prueba en $6.000.");
    expect(order).toContain("× 2, total $10.000 (sin envío)");
    expect(items[0].unitPrice).toBe(5000);
    await testPrisma.productPriceTier.deleteMany({ where: { productId: marcador.id } });
  });
});
