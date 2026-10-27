import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * Repetición anonimizada de la conversación del 24 de octubre: «marcadores
 * baratos» por el bot entero (no solo la búsqueda), con el clasificador
 * apagado a propósito: estas preguntas se resuelven sin él. Y el saludo de
 * Paula ya no se come «Hola, ¿tienen…?».
 */
const mocks = vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "clave-de-prueba";
  return { generateText: vi.fn(), sent: [] as string[] };
});
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), generateText: mocks.generateText }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => () => "modelo-simulado" }));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value !== "function" || !name.startsWith("sendWhatsApp")) continue;
    stubs[name] = async (_to: unknown, body: unknown, extra?: unknown) => {
      if (name !== "sendWhatsAppTypingIndicator") mocks.sent.push([typeof body === "string" ? body : JSON.stringify(body), extra ? JSON.stringify(extra) : ""].join(" "));
      return { ok: true, externalId: `wamid.sim-${randomUUID()}` };
    };
  }
  return stubs;
});

const suffix = randomUUID().slice(0, 8);
let storeId = "";

async function chat() {
  const phone = `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const row = await testPrisma.conversation.create({ data: { storeId, phone, status: "OPEN", lastInboundAt: new Date() } });
  return { id: row.id, phone };
}

async function ask(c: { id: string; phone: string }, body: string, keywords: unknown[] = []) {
  const externalId = `wamid.in-${randomUUID()}`;
  const at = new Date();
  await testPrisma.conversationMessage.create({ data: { conversationId: c.id, direction: "INBOUND", sentBy: "CUSTOMER", body, createdAt: at, externalId } });
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  return runWhatsAppBot({ conversationId: c.id, recipient: c.phone, body, inboundAt: at, inboundMessageId: externalId, skipHumanPause: true, keywords: keywords as never });
}

beforeAll(async () => {
  const store = await testPrisma.store.create({ data: { name: `Repetición ${suffix}`, userId: `test-user-rep-${suffix}` } });
  storeId = store.id;
  const type = await testPrisma.type.create({ data: { name: "✏️ Escritura", slug: `escritura-rep-${suffix}`, storeId } });
  const cat = await testPrisma.category.create({ data: { name: "🖍️ Marcadores", slug: `marcadores-rep-${suffix}`, storeId, typeId: type.id } });
  // Como en producción: micropuntas y resaltadores viven en su propia categoría.
  const micropuntas = await testPrisma.category.create({ data: { name: "Micropuntas", slug: `micropuntas-rep-${suffix}`, storeId, typeId: type.id } });
  const resaltadores = await testPrisma.category.create({ data: { name: "Resaltadores", slug: `resaltadores-rep-${suffix}`, storeId, typeId: type.id } });
  const design = await testPrisma.design.create({ data: { name: "Clásico", storeId } });
  const color = await testPrisma.color.create({ data: { name: "Negro", value: `#n-${suffix}`.slice(0, 20), storeId } });
  const size = await testPrisma.size.create({ data: { name: "U", value: `u-rep-${suffix}`, storeId } });
  const products: [string, number, number, string][] = [
    ["Set de marcadores x12", 16000, 50, cat.id],
    ["Marcador doble punta", 4000, 10, cat.id],
    ["Marcador permanente delgado", 2000, 3, cat.id],
    ["Micropunta negra 0.4", 1500, 1, micropuntas.id],
    ["Resaltador pastel", 2500, 2, resaltadores.id],
  ];
  for (let index = 0; index < products.length; index += 1) {
    const [name, price, soldCount, categoryId] = products[index];
    await testPrisma.product.create({
      data: { name, slug: `rep-${suffix}-${index}`, description: "<p>Prueba</p>", stock: 3, price, acqPrice: 500, soldCount, sku: `REP-${suffix}-${index}`, storeId, categoryId, colorId: color.id, sizeId: size.id, designId: design.id },
    });
  }
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const { PRODUCT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-products");
  await testPrisma.storeSettings.create({
    data: { storeId, botEnabled: true, botFactsApprovedAt: new Date(), botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION, botProductsApprovedAt: new Date(), botProductsVersion: PRODUCT_TEMPLATES_VERSION },
  });
});

afterAll(async () => {
  const conversations = await testPrisma.conversation.findMany({ where: { storeId }, select: { id: true } });
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations.map((row) => row.id) } } });
  await testPrisma.conversation.deleteMany({ where: { storeId } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId } });
  await testPrisma.product.deleteMany({ where: { storeId } });
  await testPrisma.design.deleteMany({ where: { storeId } });
  await testPrisma.color.deleteMany({ where: { storeId } });
  await testPrisma.size.deleteMany({ where: { storeId } });
  await testPrisma.category.deleteMany({ where: { storeId } });
  await testPrisma.type.deleteMany({ where: { storeId } });
  await testPrisma.store.delete({ where: { id: storeId } });
});

beforeEach(async () => {
  mocks.sent.length = 0;
  mocks.generateText.mockReset();
  mocks.generateText.mockRejectedValue(new Error("el clasificador no debe hacer falta"));
  const { resetCatalogTermCache } = await import("@/lib/whatsapp/search-intent");
  resetCatalogTermCache?.();
});

const order = (text: string, names: string[]) => names.map((name) => text.indexOf(name));

describe("«marcadores baratos» por el bot entero", () => {
  it("contesta primero con los marcadores de verdad, del más económico al más caro, y luego micropuntas y resaltadores, sin el clasificador", async () => {
    const result = await ask(await chat(), "marcadores baratos");
    expect(result.outcome).toBe("replied_product");
    expect(mocks.sent).toHaveLength(1);
    const positions = order(mocks.sent[0], [
      "Marcador permanente delgado",
      "Marcador doble punta",
      "Set de marcadores",
      "Micropunta negra",
      "Resaltador pastel",
    ]);
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("«Hola, ¿tienen marcadores baratos?» contesta los marcadores con el saludo delante, no el «Saludo» de Paula", async () => {
    const saludo = { id: "k-saludo", trigger: "hola", triggers: ["hola", "buenas"], answer: "¡Hola! 💛 Cuéntame qué estás buscando y te ayudo.", buttons: [] };
    const result = await ask(await chat(), "Hola, ¿tienen marcadores baratos?", [saludo]);
    expect(result.outcome).toBe("replied_product");
    expect(mocks.sent[0]).toMatch(/^¡Hola! /);
    expect(mocks.sent[0]).toContain("Marcador permanente delgado");
    expect(mocks.sent[0]).not.toContain("Cuéntame qué estás buscando");
  });

  it("lo que no es de productos queda con su motivo archivado", async () => {
    const c = await chat();
    const result = await ask(c, "oye una cosita del otro día");
    expect(result.outcome).toBe("escalated_no_match");
    const bot = await testPrisma.conversationMessage.findFirstOrThrow({ where: { conversationId: c.id, sentBy: "BOT" }, select: { metadata: true } });
    expect(bot.metadata).toMatchObject({ noMatch: { reason: "no_signal" } });
  });
});
