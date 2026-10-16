import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Un envío del bot que Meta rechaza: un solo reintento, solo si con certeza no
 * salió, y si tampoco sale, «El aviso no le llegó a la clienta» y «Esperando a
 * Paula» enseguida. Bot real, base local y envío simulado; datos sintéticos.
 */
type Result = { ok: true; externalId: string } | { ok: false; error: string; status: number | null; code: number | null; retryable: boolean };
const sent = vi.hoisted(() => ({ results: [] as Result[], calls: 0, onCall: null as null | (() => Promise<void>) }));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value !== "function" || !name.startsWith("sendWhatsApp")) continue;
    stubs[name] = async () => {
      if (name === "sendWhatsAppTypingIndicator") return { ok: true, externalId: "" };
      sent.calls += 1;
      if (sent.onCall) await sent.onCall();
      return sent.results.shift() ?? { ok: true, externalId: `wamid.sim-${randomUUID()}` };
    };
  }
  return stubs;
});

const META_GENERIC: Result = { ok: false, error: "(#131000) Something went wrong", status: 400, code: 131000, retryable: true };
const WINDOW_CLOSED: Result = { ok: false, error: "(#131047) Re-engagement message", status: 400, code: 131047, retryable: false };

let fixture: InventoryFixture;

async function setBot() {
  const { BUSINESS_FACT_TEMPLATES_VERSION } = await import("@/lib/whatsapp/bot-facts");
  const data = { botEnabled: true, botFactsApprovedAt: new Date(), botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION };
  await testPrisma.storeSettings.upsert({ where: { storeId: fixture.store.id }, create: { storeId: fixture.store.id, ...data }, update: data });
}

async function tapOwner() {
  const phone = `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const at = new Date();
  const conversation = await testPrisma.conversation.create({ data: { storeId: fixture.store.id, phone, status: "OPEN", lastInboundAt: at } });
  const externalId = `wamid.in-${randomUUID()}`;
  await testPrisma.conversationMessage.create({
    data: { conversationId: conversation.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "Hablar con Paula", metadata: { tap: { id: "owner" } }, createdAt: at, externalId },
  });
  const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
  const result = await runWhatsAppBot({ conversationId: conversation.id, recipient: phone, body: "Hablar con Paula", interactiveReplyId: "owner", inboundAt: at, inboundMessageId: externalId, keywords: [] });
  return { conversation, result };
}

const botRows = (conversationId: string) =>
  testPrisma.conversationMessage.findMany({ where: { conversationId, sentBy: "BOT" }, select: { id: true, status: true, metadata: true, externalId: true } });

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
  sent.results = [];
  sent.calls = 0;
  sent.onCall = null;
  await setBot();
});

describe("envío rechazado por Meta", () => {
  it("falla dos veces con 131000: un FAILED con 2 intentos, «El aviso no le llegó a la clienta» y «Esperando a Paula» enseguida", async () => {
    sent.results = [META_GENERIC, META_GENERIC];
    const { conversation, result } = await tapOwner();
    expect(result.outcome).toBe("escalated_owner_requested");
    expect(sent.calls).toBe(2);
    const rows = await botRows(conversation.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "FAILED", externalId: null, metadata: { sendAttempts: 2, sendError: { status: 400, code: 131000 } } });
    expect(JSON.stringify(rows[0].metadata)).not.toContain("Something went wrong");

    const { loadWait, findWaitingConversations } = await import("@/lib/whatsapp/waiting-list");
    expect((await loadWait(conversation.id)).deliveryFailedAt).not.toBeNull();
    const listed = await findWaitingConversations(fixture.store.id, new Date(), undefined, undefined, { includeFailedSends: true });
    expect(listed.get(conversation.id)).toMatchObject({ deliveryFailed: true });
    // El correo de recordatorio no lo usa: sin la opción, a los 0 min todavía no cuenta.
    expect((await findWaitingConversations(fixture.store.id)).has(conversation.id)).toBe(false);

    // Lo borra «Marcar como atendido»…
    const { markWaitsAttended } = await import("@/lib/whatsapp/waiting-list");
    await markWaitsAttended(fixture.store.id, [conversation.id], "user_test", new Date(Date.now() + 1000));
    expect((await loadWait(conversation.id)).deliveryFailedAt).toBeNull();
  });

  it("…y también que Paula escriba", async () => {
    sent.results = [META_GENERIC, META_GENERIC];
    const { conversation } = await tapOwner();
    await testPrisma.conversationMessage.create({ data: { conversationId: conversation.id, direction: "OUTBOUND", sentBy: "OWNER", status: "SENT", body: "Hola, ya te escribo", createdAt: new Date(Date.now() + 1000) } });
    const { loadWait } = await import("@/lib/whatsapp/waiting-list");
    expect((await loadWait(conversation.id)).deliveryFailedAt).toBeNull();
  });

  it("131000 y luego sale: un solo mensaje, enviado, con sus 2 intentos anotados; sin aviso de fallo", async () => {
    sent.results = [META_GENERIC];
    const { conversation } = await tapOwner();
    expect(sent.calls).toBe(2);
    const rows = await botRows(conversation.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "SENT", metadata: { sendAttempts: 2 } });
    const { loadWait } = await import("@/lib/whatsapp/waiting-list");
    expect((await loadWait(conversation.id)).deliveryFailedAt).toBeNull();
  });

  it("un error de política (131047, fuera de la ventana de 24 h) no se reintenta", async () => {
    sent.results = [WINDOW_CLOSED];
    const { conversation } = await tapOwner();
    expect(sent.calls).toBe(1);
    expect((await botRows(conversation.id))[0]).toMatchObject({ status: "FAILED", metadata: { sendAttempts: 1, sendError: { code: 131047 } } });
  });

  it("tras un acuse fallido, el siguiente mensaje de la clienta no manda nada: la conversación ya es de Paula y el aviso de fallo sigue", async () => {
    sent.results = [META_GENERIC, META_GENERIC];
    const { conversation } = await tapOwner();
    expect(sent.calls).toBe(2);
    const at = new Date(Date.now() + 20_000);
    const externalId = `wamid.in-${randomUUID()}`;
    await testPrisma.conversationMessage.create({ data: { conversationId: conversation.id, direction: "INBOUND", sentBy: "CUSTOMER", body: "hola?", createdAt: at, externalId } });
    const { runWhatsAppBot } = await import("@/lib/whatsapp/bot");
    const next = await runWhatsAppBot({ conversationId: conversation.id, recipient: conversation.phone!, body: "hola?", inboundAt: at, inboundMessageId: externalId, keywords: [], skipHumanPause: true });
    expect(next.outcome).toBe("skipped_needs_owner");
    expect(sent.calls).toBe(2);
    const { loadWait } = await import("@/lib/whatsapp/waiting-list");
    expect((await loadWait(conversation.id)).deliveryFailedAt).not.toBeNull();
  });

  it("si la clienta escribe durante la pausa del reintento de un acuse, no se repite y el aviso queda debido", async () => {
    sent.results = [META_GENERIC];
    let conversationId = "";
    sent.onCall = async () => {
      const row = await testPrisma.conversationMessage.findFirstOrThrow({ where: { body: "Hablar con Paula", direction: "INBOUND" }, orderBy: { createdAt: "desc" }, select: { conversationId: true } });
      conversationId = row.conversationId;
      await testPrisma.conversationMessage.create({ data: { conversationId, direction: "INBOUND", sentBy: "CUSTOMER", body: "¿me ayudas?", createdAt: new Date(Date.now() + 1_000), externalId: `wamid.in-${randomUUID()}` } });
      sent.onCall = null;
    };
    const { conversation } = await tapOwner();
    expect(sent.calls).toBe(1);
    expect(await botRows(conversation.id)).toHaveLength(0);
    const tap = await testPrisma.conversationMessage.findFirstOrThrow({ where: { conversationId: conversation.id, body: "Hablar con Paula" }, select: { metadata: true } });
    expect((tap.metadata as { handoffOwed?: { state?: string; notice?: string } }).handoffOwed).toMatchObject({ state: "owed", notice: "owner_requested" });
  });

  it("si Paula escribe durante la pausa del reintento, no se repite y no queda fallo", async () => {
    sent.results = [META_GENERIC];
    sent.onCall = async () => {
      await testPrisma.conversation.updateMany({ where: { storeId: fixture.store.id }, data: { lastOwnerAt: new Date() } });
      sent.onCall = null;
    };
    const { conversation } = await tapOwner();
    expect(sent.calls).toBe(1);
    expect(await botRows(conversation.id)).toHaveLength(0);
  });
});
