import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/** «Eliminar» del historial del copiloto: solo la conversación propia, con sus mensajes; el conocimiento queda. */
const session = vi.hoisted(() => ({ userId: "duena-1" }));
vi.mock("@/lib/store-access", () => ({ requireStoreOwner: async () => session.userId }));
vi.mock("@/lib/copiloto/config", async () => ({
  ...(await vi.importActual<typeof import("@/lib/copiloto/config")>("@/lib/copiloto/config")),
  isCopilotConfigured: () => true,
}));

let fixture: InventoryFixture;

async function conversation(storeId: string, userId: string) {
  const id = randomUUID();
  await testPrisma.assistantConversation.create({ data: { id, storeId, userId, title: "Prueba" } });
  for (const role of ["user", "assistant"]) {
    await testPrisma.assistantMessage.create({ data: { id: `del-${randomUUID()}`, conversationId: id, role, parts: [] } });
  }
  return id;
}

beforeAll(async () => {
  fixture = await createInventoryFixture();
});

afterAll(async () => {
  const store = fixture.store.id;
  const ids = (await testPrisma.assistantConversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
  await testPrisma.assistantMessage.deleteMany({ where: { conversationId: { in: ids } } });
  await testPrisma.assistantConversation.deleteMany({ where: { storeId: store } });
  await testPrisma.assistantKnowledgeNote.deleteMany({ where: { storeId: store } });
  await deleteInventoryFixture(fixture);
});

describe("DELETE copiloto/conversaciones/[conversationId]", () => {
  it("borra la conversación propia y sus mensajes, y nada más", async () => {
    const store = fixture.store.id;
    const mine = await conversation(store, "duena-1");
    const other = await conversation(store, "otra-persona");
    await testPrisma.assistantKnowledgeNote.create({ data: { storeId: store, noteId: "adhesivos", approvedHash: "h", approvedBy: "prueba", approvedAt: new Date() } });
    const { DELETE } = await import("@/app/api/[storeId]/copiloto/conversaciones/[conversationId]/route");

    const response = await DELETE(new Request("http://admin.test", { method: "DELETE" }), { params: { storeId: store, conversationId: mine } });
    expect(response.status).toBe(200);
    expect(await testPrisma.assistantConversation.count({ where: { id: mine } })).toBe(0);
    expect(await testPrisma.assistantMessage.count({ where: { conversationId: mine } })).toBe(0);

    const foreign = await DELETE(new Request("http://admin.test", { method: "DELETE" }), { params: { storeId: store, conversationId: other } });
    expect(foreign.status).toBe(404);
    expect(await testPrisma.assistantMessage.count({ where: { conversationId: other } })).toBe(2);
    expect(await testPrisma.assistantKnowledgeNote.count({ where: { storeId: store } })).toBe(1);
  });
});
