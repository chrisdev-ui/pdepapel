import { randomUUID } from "node:crypto";

import { subDays } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyCopilotRetention, planCopilotRetention } from "@/lib/copiloto/retention";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/** Retención del copiloto: solo conversaciones con más de 180 días sin actividad; el conocimiento queda. */
const now = new Date("2026-10-10T12:00:00.000Z");
let fixture: InventoryFixture;

async function conversation(storeId: string, lastMessageAt: Date, messages: number) {
  const id = randomUUID();
  await testPrisma.assistantConversation.create({ data: { id, storeId, userId: "user-retencion", title: "Prueba", lastMessageAt } });
  for (let index = 0; index < messages; index += 1) {
    await testPrisma.assistantMessage.create({
      data: { id: `ret-${randomUUID()}`, conversationId: id, role: index % 2 ? "assistant" : "user", parts: [] },
    });
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

describe("retención de conversaciones del copiloto", () => {
  it("la simulación cuenta y no borra; la aplicación borra solo lo viejo, con sus mensajes", async () => {
    const store = fixture.store.id;
    const old = await conversation(store, subDays(now, 181), 3);
    const edge = await conversation(store, subDays(now, 179), 2);
    const recent = await conversation(store, subDays(now, 1), 2);
    await testPrisma.assistantKnowledgeNote.create({
      data: { storeId: store, noteId: "adhesivos", approvedHash: "h", approvedBy: "prueba", approvedAt: subDays(now, 400) },
    });

    await expect(planCopilotRetention(now)).resolves.toMatchObject({ conversations: 1, messages: 3, olderThanDays: 180 });
    expect(await testPrisma.assistantConversation.count({ where: { storeId: store } })).toBe(3);

    await expect(applyCopilotRetention(now)).resolves.toMatchObject({ conversations: 1, messages: 3 });
    const left = (await testPrisma.assistantConversation.findMany({ where: { storeId: store }, select: { id: true } })).map((row) => row.id);
    expect(left.sort()).toEqual([edge, recent].sort());
    expect(await testPrisma.assistantMessage.count({ where: { conversationId: old } })).toBe(0);
    expect(await testPrisma.assistantMessage.count({ where: { conversationId: { in: [edge, recent] } } })).toBe(4);
    expect(await testPrisma.assistantKnowledgeNote.count({ where: { storeId: store } })).toBe(1);

    await expect(applyCopilotRetention(now)).resolves.toMatchObject({ conversations: 0, messages: 0 });
  });
});
