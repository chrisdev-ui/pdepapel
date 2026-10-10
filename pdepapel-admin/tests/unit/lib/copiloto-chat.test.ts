import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La ruta del chat del copiloto: se niega a todo lo que no corresponde
 * (sin conexión propia, sin dueña, sin presupuesto, sin Redis, conversación
 * ajena) y, cuando corresponde, responde en streaming y guarda el mensaje.
 */
const mocks = vi.hoisted(() => ({
  session: { userId: null as string | null },
  storeOwner: "user_owner",
  conversation: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  messages: vi.fn(),
  upsertMessage: vi.fn(),
  rate: vi.fn(),
  knowledge: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mocks.session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));
vi.mock("@/lib/env.mjs", () => ({ env: { OPENAI_API_KEY: "sk-test" } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/copiloto/knowledge", () => ({ getKnowledgeNotes: mocks.knowledge }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    store: { findFirst: async ({ where }: { where: { id: string; userId: string } }) => (where.userId === mocks.storeOwner ? { id: where.id } : null) },
    assistantConversation: { findUnique: mocks.conversation, create: mocks.createConversation, update: mocks.updateConversation },
    assistantMessage: { findMany: mocks.messages, upsert: mocks.upsertMessage },
  },
}));

import { handleCopilotChat } from "@/lib/copiloto/chat";

const CONVERSATION = "11111111-1111-4111-8111-111111111111";
const body = (text = "¿Qué marcador sirve para tela?", mode = "rapido") => ({
  id: CONVERSATION,
  message: { id: "msg-user-1", role: "user", parts: [{ type: "text", text }] },
  mode,
});
const request = (payload: unknown) => new Request("https://admin.test/api/store-1/copiloto/chat", { method: "POST", body: JSON.stringify(payload) });

function budgetStore(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn(async (key: string) => values[key] ?? null),
    incrbyfloat: vi.fn(async () => 0),
    expire: vi.fn(async () => 1),
  };
}

const model = () =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "Para tela, un marcador acrílico " },
          { type: "text-delta", id: "t1", delta: "[conocimiento: marcadores-acrilicos]." },
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            logprobs: undefined,
            usage: {
              inputTokens: { total: 1000, noCache: 200, cacheRead: 800, cacheWrite: undefined },
              outputTokens: { total: 50, text: 50, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  process.env.COPILOT_DATABASE_URL = "mysql://copilot_ro:x@127.0.0.1:3306/db";
  mocks.session.userId = mocks.storeOwner;
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 10, retryAfterSeconds: 0 });
  mocks.conversation.mockResolvedValue(null);
  mocks.messages.mockResolvedValue([]);
  mocks.knowledge.mockResolvedValue([]);
  mocks.upsertMessage.mockResolvedValue({});
  mocks.createConversation.mockResolvedValue({});
  mocks.updateConversation.mockResolvedValue({});
});

describe("handleCopilotChat", () => {
  it("sin COPILOT_DATABASE_URL responde 503 y no toca nada", async () => {
    delete process.env.COPILOT_DATABASE_URL;
    const response = await handleCopilotChat(request(body()), "store-1", { budgetStore: budgetStore() });
    expect(response.status).toBe(503);
    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it("sin sesión 401 y con otra cuenta 403", async () => {
    mocks.session.userId = null;
    await expect(handleCopilotChat(request(body()), "store-1", { budgetStore: budgetStore() })).rejects.toMatchObject({ statusCode: 401 });
    mocks.session.userId = "user_other";
    await expect(handleCopilotChat(request(body()), "store-1", { budgetStore: budgetStore() })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("sin Redis no arranca", async () => {
    const response = await handleCopilotChat(request(body()), "store-1", { budgetStore: null, languageModel: model });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("presupuesto") });
  });

  it("al tope del día no arranca", async () => {
    const store = budgetStore({ [`ai:copiloto:spend:${new Date().toISOString().slice(0, 10)}`]: 1 });
    const response = await handleCopilotChat(request(body()), "store-1", { budgetStore: store, languageModel: model });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("hoy") });
  });

  it("demasiadas preguntas seguidas: 429", async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const response = await handleCopilotChat(request(body()), "store-1", { budgetStore: budgetStore(), languageModel: model });
    expect(response.status).toBe(429);
  });

  it("una conversación de otra persona no se abre", async () => {
    mocks.conversation.mockResolvedValue({ storeId: "store-1", userId: "user_someone_else" });
    const response = await handleCopilotChat(request(body()), "store-1", { budgetStore: budgetStore(), languageModel: model });
    expect(response.status).toBe(404);
  });

  it("«a fondo» con el mes al 70 % usa el modelo rápido", async () => {
    const month = "ai:copiloto:spend:" + new Date().toISOString().slice(0, 7);
    const used: string[] = [];
    const response = await handleCopilotChat(request(body("Analiza mi margen", "a_fondo")), "store-1", {
      budgetStore: budgetStore({ [month]: 11 }),
      languageModel: (id) => {
        used.push(id);
        return model();
      },
    });
    await response.text();
    expect(used).toEqual(["gpt-6-luna"]);
  });

  it("responde en streaming, guarda la pregunta y la respuesta con su costo, y anota el gasto", async () => {
    const store = budgetStore();
    const response = await handleCopilotChat(request(body()), "store-1", { budgetStore: store, languageModel: model });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await response.text();
    expect(stream).toContain("Para tela, un marcador acrílico");
    await vi.waitFor(() => expect(mocks.upsertMessage).toHaveBeenCalledTimes(2));

    expect(mocks.createConversation).toHaveBeenCalledWith({
      data: { id: CONVERSATION, storeId: "store-1", userId: "user_owner", title: "¿Qué marcador sirve para tela?" },
    });
    const [question, answer] = mocks.upsertMessage.mock.calls.map((call) => call[0].create);
    expect(question).toMatchObject({ id: "msg-user-1", role: "user" });
    expect(answer).toMatchObject({ role: "assistant", model: "gpt-6-luna", inputTokens: 1000, cachedInputTokens: 800, outputTokens: 50 });
    expect(Number(answer.costUsd)).toBeGreaterThan(0);
    expect(store.incrbyfloat).toHaveBeenCalledWith(expect.stringMatching(/^ai:copiloto:spend:/), expect.any(Number));
  });
});
