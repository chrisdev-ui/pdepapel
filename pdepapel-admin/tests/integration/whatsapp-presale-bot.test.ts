import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El bot y la preventa, con el bot real contra MySQL y el envío simulado: con
 * el producto archivado (o la campaña cerrada o sin cupo) contesta igual que
 * por un producto que no está, sin texto de preventa ni enlace; visible y
 * abierta, la respuesta de preventa con «dime y te anoto». Quien pide la lista
 * de espera pasa a Paula: el bot no anota a nadie.
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

let fixture: InventoryFixture;
let calendarId = "";
let controlId = "";
let presaleId = "";

const QUESTION = "¿Tienen el calendario de adviento Kiut?";
const CONTROL_QUESTION = "¿Tienen el calendario de escritorio Luna?";

async function chat() {
  return (
    await testPrisma.conversation.create({
      data: { storeId: fixture.store.id, phone: `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`, status: "OPEN", lastInboundAt: new Date() },
    })
  ).id;
}

async function say(conversationId: string, body: string) {
  const at = new Date();
  const externalId = `wamid.in-${randomUUID()}`;
  await testPrisma.conversationMessage.create({ data: { conversationId, direction: "INBOUND", sentBy: "CUSTOMER", body, createdAt: at, externalId } });
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  const { detectWebOrigin } = await import("@/lib/whatsapp/web-origin");
  const conversation = await testPrisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { phone: true } });
  const before = sent.messages.length;
  const result = await runWhatsAppBot({
    conversationId,
    recipient: conversation.phone!,
    body,
    inboundAt: at,
    inboundMessageId: externalId,
    skipHumanPause: true,
    keywords: [],
    webOrigin: detectWebOrigin(body),
  });
  return { result, replies: sent.messages.slice(before) };
}

const setCalendar = (data: { isArchived?: boolean }) => testPrisma.product.update({ where: { id: calendarId }, data });
const setPresale = (data: Record<string, unknown>) => testPrisma.productPresale.update({ where: { id: presaleId }, data: data as never });

beforeAll(async () => {
  fixture = await createInventoryFixture();
  const attributes = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id }, select: { colorId: true, sizeId: true, designId: true } });
  const base = { storeId: fixture.store.id, categoryId: fixture.category.id, ...attributes, description: "Sintético", stock: 0, isArchived: true };
  calendarId = (
    await testPrisma.product.create({
      data: { ...base, name: "Calendario de adviento Kiut Love Letters", slug: `calendario-adviento-${randomUUID().slice(0, 8)}`, price: 160000, sku: `CAL-BOT-${randomUUID().slice(0, 6)}` } as never,
    })
  ).id;
  controlId = (
    await testPrisma.product.create({
      data: { ...base, name: "Calendario de escritorio Luna", slug: `calendario-luna-${randomUUID().slice(0, 8)}`, price: 30000, sku: `CAL-LUN-${randomUUID().slice(0, 6)}` } as never,
    })
  ).id;
  presaleId = (
    await testPrisma.productPresale.create({
      data: {
        storeId: fixture.store.id,
        productId: calendarId,
        status: "ACTIVE",
        unitLimit: null,
        expectedArrivalAt: null,
        paymentMode: "DEPOSIT",
        depositType: "FIXED",
        depositValue: 30000,
        createdBy: "test",
      } as never,
    })
  ).id;
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
  await setCalendar({ isArchived: true });
  await setPresale({ status: "ACTIVE", unitLimit: null, committedUnits: 0 });
});

afterAll(async () => {
  const store = fixture.store.id;
  const conversations = (await testPrisma.conversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.conversationMessage.deleteMany({ where: { conversationId: { in: conversations } } });
  await testPrisma.conversation.deleteMany({ where: { storeId: store } });
  await testPrisma.productPresale.deleteMany({ where: { id: presaleId } });
  await testPrisma.storeSettings.deleteMany({ where: { storeId: store } });
  await testPrisma.product.deleteMany({ where: { id: { in: [calendarId, controlId] } } });
  await deleteInventoryFixture(fixture);
});

describe("el bot y la preventa", () => {
  it("archivado: contesta igual que por un producto archivado sin preventa, sin texto de preventa ni enlace", async () => {
    const control = await say(await chat(), CONTROL_QUESTION);
    const archived = await say(await chat(), QUESTION);

    expect(archived.result.outcome).toBe(control.result.outcome);
    expect(archived.result).not.toMatchObject({ trigger: "presale" });
    const text = archived.replies.join("\n");
    expect(text).not.toMatch(/preventa|anticipo|lista de espera/i);
    expect(text).not.toContain("/producto/");
  });

  it.each([
    ["la campaña cancelada", { status: "CANCELLED" }],
    ["la campaña liberada", { status: "RELEASED" }],
    ["sin cupo", { unitLimit: 3, committedUnits: 3 }],
  ])("visible pero con %s: tampoco habla de preventa", async (_label, presale) => {
    await setCalendar({ isArchived: false });
    await setPresale(presale);
    const { result, replies } = await say(await chat(), QUESTION);
    expect(result).not.toMatchObject({ trigger: "presale" });
    expect(replies.join("\n")).not.toMatch(/preventa|anticipo|lista de espera/i);
  });

  it("visible y abierta: la respuesta de preventa con el enlace y «dime y te anoto»", async () => {
    await setCalendar({ isArchived: false });
    const { result, replies } = await say(await chat(), QUESTION);
    expect(result).toMatchObject({ outcome: "replied_product", trigger: "presale" });
    const text = replies.join("\n");
    expect(text).toContain("está en preventa");
    expect(text).toMatch(/30\.000 de anticipo/);
    expect(text).toContain("/producto/calendario-adviento-");
    expect(text).toContain("Si prefieres esperar, dime y te anoto en la lista de espera.");
  });

  it("«sí, anótame en la lista de espera» pasa a Paula: aviso de que ella escribe, conversación para ella, nadie anotado", async () => {
    await setCalendar({ isArchived: false });
    const id = await chat();
    await say(id, QUESTION);
    const { result, replies } = await say(id, "Sí, anótame en la lista de espera porfa");
    expect(result).toMatchObject({ outcome: "escalated_owner_requested" });
    const { TALK_TO_OWNER_ACKNOWLEDGEMENT } = await import("@/lib/whatsapp/bot-acknowledgements");
    expect(replies).toEqual([TALK_TO_OWNER_ACKNOWLEDGEMENT]);
    expect((await testPrisma.conversation.findUniqueOrThrow({ where: { id }, select: { status: true } })).status).toBe("NEEDS_OWNER");
    expect(await testPrisma.preorderWaitlistEntry.count({ where: { storeId: fixture.store.id } })).toBe(0);
  });
});
