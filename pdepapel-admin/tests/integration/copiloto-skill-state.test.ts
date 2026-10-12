import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Correcciones de Paula a las habilidades contra la base local: se guardan
 * como filas «skill-event», el estado se rehace igual al recargar, y ninguna
 * lectura de la conversación las devuelve. Datos sintéticos.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));

let fixture: InventoryFixture;
let conversationId = "";

beforeAll(async () => {
  process.env.COPILOT_DATABASE_URL = "mysql://copilot_ro:x@127.0.0.1:3306/no-se-usa";
  fixture = await createInventoryFixture();
  session.userId = fixture.store.userId;
  conversationId = randomUUID();
  await testPrisma.assistantConversation.create({ data: { id: conversationId, storeId: fixture.store.id, userId: fixture.store.userId, title: "Prueba" } });
  await testPrisma.assistantMessage.create({ data: { id: `u-${randomUUID()}`, conversationId, role: "user", parts: [{ type: "text", text: "Mejora la ficha" }], createdAt: new Date(Date.now() - 60_000) } });
  await testPrisma.assistantMessage.create({
    data: {
      id: `a-${randomUUID()}`,
      conversationId,
      role: "assistant",
      parts: [{ type: "tool-cargarHabilidad", toolCallId: "c1", state: "output-available", input: { id: "marketing" }, output: { ok: true, id: "marketing" } }, { type: "text", text: "Listo" }],
      createdAt: new Date(Date.now() - 50_000),
    },
  });
});

afterAll(async () => {
  await testPrisma.assistantMessage.deleteMany({ where: { conversationId } });
  await testPrisma.assistantConversation.deleteMany({ where: { id: conversationId } });
  await deleteInventoryFixture(fixture);
  delete process.env.COPILOT_DATABASE_URL;
});

const params = () => ({ params: { storeId: fixture.store.id, conversationId } });
const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/[storeId]/copiloto/conversaciones/[conversationId]/habilidades/route");
  return POST(new Request("http://test.local", { method: "POST", body: JSON.stringify(body) }), params());
};

describe("correcciones de habilidades en la base", () => {
  it("quitar y agregar desde los chips: el estado sobrevive a recargar y la fila no trae texto libre", async () => {
    expect(await (await post({ action: "remove", skillId: "marketing" })).json()).toMatchObject({ loaded: [], blocked: ["marketing"], modelChosen: ["marketing"] });
    expect(await (await post({ action: "add", skillId: "descripciones" })).json()).toMatchObject({ loaded: ["descripciones"], pinned: ["descripciones"] });
    expect((await post({ action: "add", skillId: "inventada" })).status).toBe(400);

    const { readSkillState } = await import("@/lib/copiloto/skill-state");
    expect(await readSkillState(conversationId)).toEqual({ loaded: ["descripciones"], pinned: ["descripciones"], blocked: ["marketing"], modelChosen: ["marketing"] });

    const events = await testPrisma.assistantMessage.findMany({ where: { conversationId, role: "skill-event" }, orderBy: { createdAt: "asc" }, select: { parts: true } });
    expect(events.map((row) => Object.keys(row.parts as object).sort())).toEqual([
      ["action", "messageId", "modelChosenSkills", "skillId"],
      ["action", "messageId", "modelChosenSkills", "skillId"],
    ]);
  });

  it("la conversación que se abre en el panel no trae las filas de corrección, pero sí su estado", async () => {
    const { GET } = await import("@/app/api/[storeId]/copiloto/conversaciones/[conversationId]/route");
    const data = await (await GET(new Request("http://test.local"), params())).json();
    expect(data.messages.map((message: { role: string }) => message.role)).toEqual(["user", "assistant"]);
    expect(data.habilidades).toMatchObject({ loaded: ["descripciones"], blocked: ["marketing"] });
  });

  it("Sistemas cuenta las correcciones de los últimos 30 días por habilidad", async () => {
    const { measureCopilotSkillOverrides } = await import("@/lib/job-runs");
    const row = await measureCopilotSkillOverrides(fixture.store.id, new Date());
    expect(row.detail).toBe("descripciones: 0 quitadas, 1 agregada · marketing: 1 quitada, 0 agregadas · 0 respuestas de nuevo");
  });
});
