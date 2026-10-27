import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El bot revienta a mitad de camino: la conversación pasa a Paula y se
 * programa la espera (la que avisa a la dueña). A la clienta no le sale nada.
 */
const calls = vi.hoisted(() => ({ waits: [] as string[], sends: 0 }));
vi.mock("@/lib/whatsapp/bot", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/bot")>("@/lib/whatsapp/bot");
  return { ...actual, runWhatsAppBot: async () => Promise.reject(new Error("fallo simulado del bot")) };
});
vi.mock("@/lib/whatsapp/wait-assist", () => ({
  scheduleWaitChecks: async (conversationId: string) => {
    calls.waits.push(conversationId);
    return { scheduled: true };
  },
}));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = { ...actual };
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value === "function" && name.startsWith("sendWhatsApp")) {
      stubs[name] = async () => {
        calls.sends += 1;
        return { ok: true, externalId: `wamid.sim-${randomUUID()}` };
      };
    }
  }
  return stubs;
});

const WABA = "1449676032671804";
let fixture: InventoryFixture;
let connectionId = "";

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
  await testPrisma.marketplaceWebhookEvent.deleteMany({ where: { connectionId } });
  await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
  await deleteInventoryFixture(fixture);
});

describe("guarda contra el silencio", () => {
  it("si el bot falla, la conversación queda para Paula, con espera programada y sin mensaje a la clienta", async () => {
    const phone = `57301${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
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
                    messages: [{ from: phone, id: `wamid.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "¿tienen cuadernos?" } }],
                  },
                },
              ],
            },
          ],
        } as never,
        status: "PENDING",
      },
      select: { id: true },
    });

    const { processWhatsAppWebhookEvent } = await import("@/lib/whatsapp/conversation-sync");
    await expect(processWhatsAppWebhookEvent(event.id)).resolves.toMatchObject({ processed: true });

    const chat = await testPrisma.conversation.findFirstOrThrow({ where: { storeId: fixture.store.id, phone }, select: { id: true, status: true } });
    expect(chat.status).toBe("NEEDS_OWNER");
    expect(calls.waits).toEqual([chat.id]);
    expect(calls.sends).toBe(0);
  });
});
