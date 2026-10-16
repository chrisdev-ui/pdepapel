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
  createMessage: vi.fn(),
  findMessage: vi.fn(),
  deleteMessages: vi.fn(),
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
    assistantMessage: {
      findMany: mocks.messages,
      upsert: mocks.upsertMessage,
      create: mocks.createMessage,
      findFirst: mocks.findMessage,
      deleteMany: mocks.deleteMessages,
    },
  },
}));

// Los borradores de kits sin base de datos: solo importa qué herramientas ve el modelo en cada paso.
vi.mock("@/lib/copiloto/skills/kits-tool", async () => {
  const { tool } = await import("ai");
  const { z } = await import("zod");
  return {
    kitsParaRotarTool: () =>
      tool({
        description: "Borradores de kits (prueba)",
        inputSchema: z.object({}),
        execute: async () => ({
          datos: {
            totalLentos: 1,
            lentos: [],
            kits: [{ nombreSugerido: "Kit Libretas Kawaii", n: 1, ocasion: null, piezas: [{ nombre: "Libreta", rol: "lento", categoria: "Libretas", precioEfectivo: 9000 }], kitsArmables: 2, sumaPreciosEfectivos: 9000, precioSugerido: 7900, ahorroPct: 12, margenPct: 50 }],
          },
        }),
      }),
  };
});

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
  mocks.createMessage.mockResolvedValue({});
  mocks.findMessage.mockResolvedValue(null);
  mocks.deleteMessages.mockResolvedValue({ count: 0 });
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

  it("habilidades: prefijo fijo idéntico, contexto justo antes de la pregunta y herramientas solo con la habilidad cargada", async () => {
    mocks.knowledge.mockResolvedValue([
      { id: "acuarela-basicos", titulo: "Acuarela", body: "Papel grueso", tema: "tecnicas", habilidad: null, approved: true },
      { id: "plantilla-descripciones", titulo: "Plantilla", body: "Preferencias de Paula", tema: "catalogo", habilidad: "descripciones", approved: true },
    ]);
    const loadedPart = {
      type: "tool-cargarHabilidad",
      toolCallId: "call-1",
      state: "output-available",
      input: { id: "descripciones" },
      output: { ok: true, id: "descripciones", nombre: "Descripciones", instrucciones: "TEXTO LARGO DE LA HABILIDAD", herramientas: ["productoParaDescripcion"] },
    };
    const calls: { prompt: { role: string; content: unknown }[]; tools: { name: string }[] }[] = [];
    const run = async (history: unknown[]) => {
      mocks.messages.mockResolvedValue(history);
      const used = model();
      const response = await handleCopilotChat(request(body("Mejora la descripción del set Workpal")), "store-1", { budgetStore: budgetStore(), languageModel: () => used });
      await response.text();
      calls.push(used.doStreamCalls[0] as never);
    };
    await run([]);
    await run([{ id: "a1", role: "assistant", parts: [{ type: "step-start" }, loadedPart, { type: "text", text: "Listo." }] }]);
    const [fresh, loaded] = calls;

    const systemOf = (call: (typeof calls)[number]) => call.prompt.filter((message) => message.role === "system").map((message) => String(message.content));
    expect(systemOf(fresh)[0]).toBe(systemOf(loaded)[0]);
    expect(systemOf(fresh)[0]).not.toContain("Hoy es");
    expect(systemOf(fresh)[0]).not.toContain("Preferencias de Paula");
    // El contexto (y la habilidad cargada con su nota) va justo antes de la pregunta.
    for (const call of calls) {
      const index = call.prompt.findIndex((message, position) => position > 0 && message.role === "system");
      expect(index).toBe(call.prompt.length - 2);
      expect(call.prompt[call.prompt.length - 1].role).toBe("user");
    }
    expect(systemOf(loaded)[1]).toContain("Habilidad Descripciones (cargada)");
    expect(systemOf(loaded)[1]).toContain("Preferencias de Paula");
    expect(systemOf(fresh)[1]).not.toContain("Habilidad Descripciones (cargada)");
    // El texto de la habilidad no viaja dos veces: en el historial queda «cargada».
    expect(JSON.stringify(loaded.prompt)).not.toContain("TEXTO LARGO DE LA HABILIDAD");

    const toolNames = (call: (typeof calls)[number]) => call.tools.map((entry) => entry.name);
    expect(toolNames(fresh)).toContain("cargarHabilidad");
    expect(toolNames(fresh)).not.toContain("productoParaDescripcion");
    expect(toolNames(loaded)).toContain("productoParaDescripcion");
    expect(toolNames(fresh).slice(0, 12)).toEqual(toolNames(loaded).slice(0, 12));
  });

  it("ya no acepta el viejo «Modo Marketing»: el campo se ignora", async () => {
    const used = model();
    const response = await handleCopilotChat(request({ ...body("Dame una idea de Reel"), marketing: true }), "store-1", { budgetStore: budgetStore(), languageModel: () => used });
    await response.text();
    expect(JSON.stringify(used.doStreamCalls[0].prompt)).not.toContain("Habilidad Marketing (cargada)");
  });

  it("responde en streaming, guarda la pregunta y la respuesta con su costo, y anota el gasto", async () => {
    const store = budgetStore();
    const response = await handleCopilotChat(request(body()), "store-1", { budgetStore: store, languageModel: model });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await response.text();
    // El texto llega en pedazos (el cambio de palabras guarda la cola de cada uno): se junta antes de mirarlo.
    const streamed = stream
      .split("\n")
      .filter((line) => line.startsWith("data: {"))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; delta?: string })
      .filter((chunk) => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join("");
    expect(streamed).toContain("Para tela, un marcador acrílico");
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

describe("correcciones de Paula a las habilidades", () => {
  type Row = { id: string; role: string; parts: unknown; createdAt: Date };
  let rows: Row[];
  const matches = (row: Row, where: { role?: unknown; createdAt?: { gte?: Date } }) => {
    const role = where.role as string | { in: string[] } | undefined;
    if (typeof role === "string" && row.role !== role) return false;
    if (role && typeof role === "object" && !role.in.includes(row.role)) return false;
    if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
    return true;
  };
  const loadedPart = (id: string) => ({ type: "tool-cargarHabilidad", toolCallId: `c-${id}`, state: "output-available", input: { id }, output: { ok: true, id } });
  const event = (action: string, skillId: string | null) => ({ action, skillId, modelChosenSkills: [], messageId: null });

  beforeEach(() => {
    rows = [];
    mocks.messages.mockImplementation(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy: { createdAt: "asc" | "desc" } }) => {
      const found = rows.filter((row) => matches(row, where as never));
      return orderBy?.createdAt === "desc" ? [...found].reverse() : found;
    });
    mocks.createMessage.mockImplementation(async ({ data }: { data: Row }) => {
      rows.push({ ...data, createdAt: data.createdAt ?? new Date() });
      return data;
    });
    mocks.deleteMessages.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
      const before = rows.length;
      rows = rows.filter((row) => !where.id.in.includes(row.id));
      return { count: before - rows.length };
    });
    mocks.findMessage.mockImplementation(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null);
  });

  const ask = async (payload: Record<string, unknown>) => {
    const used = model();
    const response = await handleCopilotChat(request(payload), "store-1", { budgetStore: budgetStore(), languageModel: () => used });
    const text = await response.text();
    return { used, text };
  };
  const eventsOf = () => rows.filter((row) => row.role === "skill-event").map((row) => (row.parts as { action: string; skillId: string | null }));

  it("una habilidad que Paula quitó no manda ni sus instrucciones ni sus herramientas, aunque el copiloto la haya cargado", async () => {
    mocks.conversation.mockResolvedValue({ storeId: "store-1", userId: "user_owner" });
    rows.push({ id: "a1", role: "assistant", parts: [loadedPart("descripciones")], createdAt: new Date("2026-10-12T10:00:00Z") });
    rows.push({ id: "e1", role: "skill-event", parts: event("removed", "descripciones"), createdAt: new Date("2026-10-12T10:01:00Z") });
    const { used } = await ask(body("Mejora la descripción del set Workpal"));
    const call = used.doStreamCalls[0] as unknown as { prompt: { role: string; content: unknown }[]; tools: { name: string }[] };
    expect(call.tools.map((tool) => tool.name)).not.toContain("productoParaDescripcion");
    const context = String(call.prompt.filter((message) => message.role === "system")[1]?.content);
    expect(context).not.toContain("Habilidad Descripciones (cargada)");
    expect(context).toContain("Paula desactivó en esta conversación: descripciones");
    // Las filas de corrección nunca viajan al modelo.
    expect(JSON.stringify(call.prompt)).not.toContain("modelChosenSkills");
  });

  it("«no uses marketing» se resuelve sin el modelo: anota la corrección y responde fijo", async () => {
    const { used, text } = await ask(body("No uses Marketing, por favor"));
    expect(used.doStreamCalls).toHaveLength(0);
    expect(text).toContain("dejo de usar Marketing en esta conversación");
    expect(eventsOf()).toEqual([expect.objectContaining({ action: "removed", skillId: "marketing" })]);
    expect(rows.filter((row) => row.role === "assistant")).toHaveLength(1);
  });

  it("una pregunta que solo se parece a la orden va al modelo", async () => {
    const { used } = await ask(body("¿Tienen el Marketing planner?"));
    expect(used.doStreamCalls).toHaveLength(1);
    expect(eventsOf()).toEqual([]);
  });

  it("«Responder de nuevo» borra solo la última respuesta y anota la corrección", async () => {
    mocks.conversation.mockResolvedValue({ storeId: "store-1", userId: "user_owner" });
    rows.push({ id: "u1", role: "user", parts: [{ type: "text", text: "uno" }], createdAt: new Date("2026-10-12T10:00:00Z") });
    rows.push({ id: "a1", role: "assistant", parts: [{ type: "text", text: "respuesta uno" }], createdAt: new Date("2026-10-12T10:00:05Z") });
    rows.push({ id: "msg-user-1", role: "user", parts: [{ type: "text", text: "dos" }], createdAt: new Date("2026-10-12T10:01:00Z") });
    rows.push({ id: "a2", role: "assistant", parts: [loadedPart("marketing")], createdAt: new Date("2026-10-12T10:01:05Z") });
    await ask({ ...body("dos"), regenerar: true });
    expect(rows.map((row) => row.id)).toContain("a1");
    expect(rows.map((row) => row.id)).not.toContain("a2");
    expect(eventsOf()).toEqual([expect.objectContaining({ action: "regenerated", skillId: null })]);
    expect((rows.find((row) => row.role === "skill-event")!.parts as { modelChosenSkills: string[] }).modelChosenSkills).toEqual(["marketing"]);
  });

  it("las fijadas antes de la primera pregunta se anotan al crear la conversación", async () => {
    const { used } = await ask({ ...body("Escribe la descripción del set Workpal"), habilidades: ["descripciones", "inventada"] });
    expect(eventsOf()).toEqual([expect.objectContaining({ action: "added", skillId: "descripciones" })]);
    const tools = (used.doStreamCalls[0] as unknown as { tools: { name: string }[] }).tools.map((tool) => tool.name);
    expect(tools).toContain("productoParaDescripcion");
  });

  describe("textosDeKits: solo en el paso que sigue a kitsParaRotar", () => {
    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    };
    const toolCall = (toolName: string, input: unknown) => [
      { type: "tool-call", toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
      { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, logprobs: undefined, usage },
    ];
    const text = [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Listo." },
      { type: "text-end", id: "t1" },
      { type: "finish", finishReason: { unified: "stop", raw: undefined }, logprobs: undefined, usage },
    ];
    /** Un modelo que contesta en orden lo que se le da y guarda qué herramientas le ofrecieron en cada paso. */
    const scripted = (steps: unknown[][]) => {
      let index = 0;
      return new MockLanguageModelV4({
        doStream: async () => ({ stream: simulateReadableStream({ chunks: (steps[index++] ?? text) as never[] }) }),
      });
    };
    const offered = (used: MockLanguageModelV4) =>
      used.doStreamCalls.map((call) => ({ tools: (call.tools ?? []).map((entry) => entry.name), toolChoice: call.toolChoice }));
    const kitsLoaded = [
      {
        id: "a0",
        role: "assistant",
        parts: [{ type: "step-start" }, { type: "tool-cargarHabilidad", toolCallId: "call-0", state: "output-available", input: { id: "kits" }, output: { ok: true, id: "kits", nombre: "Kits", instrucciones: "…", herramientas: ["kitsParaRotar"] } }],
      },
    ];
    const TEXTS = { kits: [{ n: 1, nombreCorto: "Kit Libretas Kawaii", loQueAmaras: ["Ideas en orden", "Color para tus apuntes"], idealPara: null }] };

    it("tras los borradores de kits se ofrece solo textosDeKits, obligada, y la respuesta termina ahí", async () => {
      mocks.messages.mockResolvedValue(kitsLoaded);
      const used = scripted([toolCall("kitsParaRotar", {}), toolCall("textosDeKits", TEXTS), text]);
      const response = await handleCopilotChat(request(body("¿Qué kits puedo armar?")), "store-1", { budgetStore: budgetStore(), languageModel: () => used });
      const streamed = await response.text();
      const steps = offered(used);
      expect(steps).toHaveLength(2);
      expect(steps[0].tools).toContain("kitsParaRotar");
      expect(steps[0].tools).not.toContain("textosDeKits");
      expect(steps[1]).toEqual({ tools: ["textosDeKits"], toolChoice: { type: "tool", toolName: "textosDeKits" } });
      expect(streamed).toContain("Kit Libretas Kawaii");
      expect(streamed).not.toContain("Listo.");
    });

    it("en otra pregunta de la misma conversación (kits ya cargada), textosDeKits no se ofrece", async () => {
      mocks.messages.mockResolvedValue([
        ...kitsLoaded,
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "step-start" },
            { type: "tool-kitsParaRotar", toolCallId: "call-k", state: "output-available", input: {}, output: { datos: { kits: [{}] } } },
            { type: "tool-textosDeKits", toolCallId: "call-t", state: "output-available", input: TEXTS, output: { ok: true, recibidos: 1 } },
          ],
        },
      ]);
      const used = scripted([text]);
      const response = await handleCopilotChat(request(body("¿Y cuánto vendí hoy?")), "store-1", { budgetStore: budgetStore(), languageModel: () => used });
      await response.text();
      const steps = offered(used);
      expect(steps).toHaveLength(1);
      expect(steps[0].tools).toContain("kitsParaRotar");
      expect(steps[0].tools).not.toContain("textosDeKits");
      expect(steps[0].toolChoice).not.toEqual({ type: "tool", toolName: "textosDeKits" });
    });

    it("una pregunta que no usa kitsParaRotar nunca ve textosDeKits, en ningún paso", async () => {
      mocks.messages.mockResolvedValue(kitsLoaded);
      const used = scripted([toolCall("cargarHabilidad", { id: "marketing" }), text]);
      const response = await handleCopilotChat(request(body("Dame ideas de Reel")), "store-1", { budgetStore: budgetStore(), languageModel: () => used });
      await response.text();
      expect(offered(used).every((step) => !step.tools.includes("textosDeKits"))).toBe(true);
    });
  });
});
