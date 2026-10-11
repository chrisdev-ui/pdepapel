import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Modo sombra del bot de WhatsApp: el bot nuevo decide en silencio qué habría
 * mandado. Nunca envía nada, solo escribe su propia fila, y sus planes cumplen
 * las reglas que se enviarían (2 mensajes por mensaje, bienvenida una vez,
 * enlace al catálogo solo si lo piden, frenos antes de clasificar).
 */
const mocks = vi.hoisted(() => ({
  writes: [] as string[],
  send: {} as Record<string, ReturnType<typeof vi.fn>>,
  classify: vi.fn(),
  botEnabled: vi.fn(),
  pending: vi.fn(),
  newer: null as { id: string } | null,
  lastBot: null as { body: string | null; metadata: unknown } | null,
  realRows: [] as { body: string | null; metadata: unknown }[],
  productCount: 0,
  create: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: { OPENAI_API_KEY: "sk-test", FRONTEND_STORE_URL: "https://tienda.test" } }));
vi.mock("@/lib/whatsapp/send", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/send");
  const stubs: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(actual)) {
    if (typeof value === "function") {
      mocks.send[name] = vi.fn();
      stubs[name] = mocks.send[name];
    } else {
      stubs[name] = value;
    }
  }
  return stubs;
});
vi.mock("@/lib/whatsapp/shadow/intent", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/shadow/intent")>("@/lib/whatsapp/shadow/intent");
  return { ...actual, classifyMessageIntent: mocks.classify };
});
vi.mock("@/lib/whatsapp/bot-guards", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/bot-guards")>("@/lib/whatsapp/bot-guards");
  return { ...actual, isBotEnabled: mocks.botEnabled, findPendingCustomerActivity: mocks.pending };
});
vi.mock("@/lib/store-settings", () => ({ getStoreSettings: async () => ({}) }));
vi.mock("@/lib/whatsapp/bot-replies", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/lib/whatsapp/bot-replies");
  return { ...actual, getActiveBotKeywords: async () => [] };
});
vi.mock("@/lib/whatsapp/bot-facts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/bot-facts")>("@/lib/whatsapp/bot-facts");
  return { ...actual, areBusinessFactsApproved: () => true };
});
vi.mock("@/lib/whatsapp/bot-products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/bot-products")>("@/lib/whatsapp/bot-products");
  return { ...actual, areProductAnswersApproved: () => true };
});
vi.mock("@/lib/prismadb", () => ({
  default: new Proxy({} as Record<string, unknown>, {
    get: (_target, model: string) => {
      if (model === "then") return undefined;
      return new Proxy({} as Record<string, unknown>, {
        get: (_m, method: string) => {
          if (model === "whatsAppBotShadowRun" && method === "create") {
            return async (args: unknown) => {
              mocks.writes.push(`${model}.${method}`);
              return mocks.create(args);
            };
          }
          if (/^(create|update|upsert|delete)/.test(method)) {
            return async () => {
              mocks.writes.push(`${model}.${method}`);
              return {};
            };
          }
          if (model === "conversation" && method === "findUnique") return async () => ({ storeId: "store-1", lastOwnerAt: null });
          if (model === "conversationMessage" && method === "findFirst") {
            return async ({ where }: { where: { externalId?: string; createdAt?: { gt?: Date } } }) => {
              if (where.externalId) return { id: "msg-1", createdAt: new Date("2026-10-10T15:23:11.000Z") };
              if (where.createdAt?.gt) return mocks.newer;
              return mocks.lastBot;
            };
          }
          if (model === "conversationMessage" && method === "findMany") {
            return async ({ where }: { where: { direction?: string } }) => (where.direction === "OUTBOUND" ? mocks.realRows : []);
          }
          if (model === "conversationMessage" && method === "count") return async () => 3;
          if (model === "product" && method === "count") return async () => mocks.productCount;
          if (method === "findMany") return async () => [];
          return async () => null;
        },
      });
    },
  }),
}));

import { realTypesFrom, runWhatsAppBotShadow } from "@/lib/whatsapp/shadow/run";
import { planShadowReply, type ShadowContext, type ShadowPlan } from "@/lib/whatsapp/shadow/plan";
import { summarizeShadowRuns } from "@/lib/whatsapp/shadow/report";

const ctx = (overrides: Partial<ShadowContext> = {}): ShadowContext => ({
  botEnabled: true,
  ownerActive: false,
  newerInbound: false,
  pending: null,
  waitingForPaula: false,
  ownerEverWrote: false,
  lastBotWasNoMatch: false,
  firstMessage: false,
  emojiOnly: false,
  welcomeRecently: false,
  catalogLinkBefore: false,
  factsApproved: true,
  productsApproved: true,
  casualApproved: true,
  businessFact: false,
  welcomeGreeting: false,
  keywordMatch: false,
  looksLikeProduct: false,
  recentPlannedMessages: 0,
  orderReply: false,
  orderAppend: false,
  shippingQuestion: false,
  webOrigin: null,
  webProductAvailable: false,
  ...overrides,
});
const noSearch = { ran: false } as const;
const found = (yes: boolean) => ({ ran: true, found: yes }) as const;
const atMostTwo = (plan: ShadowPlan) => expect(plan.types.length).toBeLessThanOrEqual(2);

describe("plan de la sombra: los tres incidentes, reescritos sin datos reales", () => {
  it("0edf2505: saludo, «¿cómo estás?» y una pregunta de producto en 20 s → solo la respuesta de producto", () => {
    // Cuando la sombra mira los dos primeros, el siguiente mensaje ya está archivado.
    const hello = planShadowReply(ctx({ newerInbound: true, firstMessage: true }), { intent: "greeting", search: noSearch });
    const howAreYou = planShadowReply(ctx({ newerInbound: true }), { intent: "greeting", search: noSearch });
    const product = planShadowReply(ctx({ looksLikeProduct: true }), { intent: "product", search: found(true) });
    expect(hello).toEqual({ types: [], skipReason: "superseded" });
    expect(howAreYou).toEqual({ types: [], skipReason: "superseded" });
    expect(product).toEqual({ types: ["product_list"], skipReason: null });
    for (const plan of [hello, howAreYou, product]) atMostTwo(plan);
  });

  it("be13c1c7: saludo con la pregunta ya en fila, producto, y «¿cuánto vale?» con el toque de Paula esperando", () => {
    const greeting = planShadowReply(ctx({ firstMessage: true, pending: "customer_message" }), { intent: "greeting", search: noSearch });
    const product = planShadowReply(ctx(), { intent: "product", search: found(true) });
    const followUp = planShadowReply(ctx({ pending: "customer_message" }), { intent: "product", search: found(true) });
    expect(greeting.types).toEqual([]);
    expect(product.types).toEqual(["product_list"]);
    expect(product.types).not.toContain("catalog_link");
    expect(followUp).toEqual({ types: [], skipReason: "superseded" });
  });

  it("449d6f5e: saludo largo, regalo de anime con errores y luego «harry potter» tras su «Esa no me la sé»", () => {
    const opener = planShadowReply(ctx({ firstMessage: true }), { intent: "greeting", search: noSearch });
    const anime = planShadowReply(ctx(), { intent: "product", search: found(false) });
    const harryPotter = planShadowReply(ctx({ waitingForPaula: true, lastBotWasNoMatch: true }), { intent: "product", search: found(true) });
    expect(opener.types).toEqual(["welcome"]);
    expect(anime.types).toEqual(["handoff"]);
    expect(harryPotter.types).toEqual(["product_list"]);
    for (const plan of [opener, anime, harryPotter]) {
      atMostTwo(plan);
      expect(plan.types).not.toContain("catalog_link");
    }
  });
});

describe("plan de la sombra: pedidos y envío", () => {
  it("un «sí» fresco a un producto ofrecido planea el pedido, sin clasificador", () => {
    expect(planShadowReply(ctx({ orderReply: true }), { intent: null, search: noSearch })).toEqual({ types: ["order_request"], skipReason: null });
  });

  it("esperando a Paula por el pedido del bot, solo suma un producto inequívoco", () => {
    expect(planShadowReply(ctx({ waitingForPaula: true, orderAppend: true }), { intent: null, search: noSearch }).types).toEqual(["order_append"]);
    expect(planShadowReply(ctx({ waitingForPaula: true, orderReply: true }), { intent: null, search: noSearch }).skipReason).toBe("needs_owner");
  });

  it("los frenos van antes: con el interruptor apagado o Paula activa, silencio", () => {
    expect(planShadowReply(ctx({ orderReply: true, botEnabled: false }), { intent: null, search: noSearch }).skipReason).toBe("bot_disabled");
    expect(planShadowReply(ctx({ orderAppend: true, ownerActive: true }), { intent: null, search: noSearch }).skipReason).toBe("owner_active");
  });

  it("la pregunta por el envío planea la respuesta de envío", () => {
    expect(planShadowReply(ctx({ shippingQuestion: true }), { intent: "product", search: noSearch }).types).toEqual(["shipping_quote"]);
  });
});

describe("plan de la sombra: tienda web", () => {
  it("un mensaje según la página; el producto disponible va con su respuesta", () => {
    expect(planShadowReply(ctx({ webOrigin: "product", webProductAvailable: true }), { intent: null, search: noSearch }).types).toEqual(["web_product"]);
    expect(planShadowReply(ctx({ webOrigin: "product" }), { intent: null, search: noSearch }).types).toEqual(["web_welcome"]);
    expect(planShadowReply(ctx({ webOrigin: "cart" }), { intent: null, search: noSearch }).types).toEqual(["web_welcome"]);
    expect(planShadowReply(ctx({ webOrigin: "order" }), { intent: null, search: noSearch }).types).toEqual(["web_welcome"]);
  });

  it("la bienvenida web cuenta como la del día: la segunda vez, silencio", () => {
    expect(planShadowReply(ctx({ webOrigin: "general", welcomeRecently: true }), { intent: null, search: noSearch }).skipReason).toBe("welcome_repeat");
  });
});

describe("plan de la sombra: reglas", () => {
  it("el enlace al catálogo sale solo cuando preguntan qué venden, y una vez por conversación", () => {
    expect(planShadowReply(ctx(), { intent: "catalog_question", search: noSearch }).types).toEqual(["casual_text", "catalog_link"]);
    expect(planShadowReply(ctx({ catalogLinkBefore: true }), { intent: "catalog_question", search: noSearch }).types).toEqual(["casual_text"]);
    expect(planShadowReply(ctx({ welcomeGreeting: true }), { intent: "greeting", search: noSearch }).types).toEqual(["welcome"]);
    expect(planShadowReply(ctx(), { intent: "other", search: noSearch }).types).toEqual(["handoff"]);
  });

  it("la bienvenida, una vez cada 24 h", () => {
    expect(planShadowReply(ctx({ welcomeRecently: true }), { intent: "greeting", search: noSearch })).toEqual({ types: [], skipReason: "welcome_repeat" });
  });

  it("respeta el interruptor, a Paula y lo que espera en la fila", () => {
    const signals = { intent: "product" as const, search: found(true) };
    expect(planShadowReply(ctx({ botEnabled: false }), signals).skipReason).toBe("bot_disabled");
    expect(planShadowReply(ctx({ ownerActive: true }), signals).skipReason).toBe("owner_active");
    expect(planShadowReply(ctx({ pending: "owner_message" }), signals).skipReason).toBe("pending_owner");
    expect(planShadowReply(ctx({ waitingForPaula: true, lastBotWasNoMatch: true, ownerEverWrote: true }), signals).skipReason).toBe("needs_owner");
    expect(planShadowReply(ctx({ waitingForPaula: true }), signals).skipReason).toBe("needs_owner");
  });

  it("esperando a Paula tras su «Esa no me la sé», lo que no es producto queda en silencio", () => {
    expect(planShadowReply(ctx({ waitingForPaula: true, lastBotWasNoMatch: true }), { intent: "thanks", search: noSearch })).toEqual({
      types: [],
      skipReason: "needs_owner",
    });
  });

  it("no pasa de 4 mensajes cada 10 minutos", () => {
    expect(planShadowReply(ctx({ recentPlannedMessages: 3 }), { intent: "catalog_question", search: noSearch }).skipReason).toBe("cap_per_window");
    expect(planShadowReply(ctx({ recentPlannedMessages: 2 }), { intent: "catalog_question", search: noSearch }).types).toHaveLength(2);
  });

  it("un emoji abre con bienvenida y a mitad de conversación no se contesta", () => {
    expect(planShadowReply(ctx({ emojiOnly: true, firstMessage: true }), { intent: null, search: noSearch }).types).toEqual(["welcome"]);
    expect(planShadowReply(ctx({ emojiOnly: true }), { intent: null, search: noSearch })).toEqual({ types: [], skipReason: "acknowledgement" });
  });

  it("un dato del negocio va antes del clasificador; una queja va a Paula", () => {
    expect(planShadowReply(ctx({ businessFact: true }), { intent: "product", search: noSearch }).types).toEqual(["fact"]);
    expect(planShadowReply(ctx(), { intent: "escalate", search: noSearch }).types).toEqual(["handoff"]);
  });
});

const candidate = {
  conversationId: "conv-1",
  body: "quiere harry potter",
  interactiveReplyId: null,
  inboundMessageId: "wamid.secreto",
  eventId: "event-1",
  eventCreatedAt: new Date("2026-10-10T15:23:12.000Z"),
  customerPhone: "570000000000",
  customerBsuid: null,
};
const deps = { noMatchText: "Esa no me la sé" };

describe("runWhatsAppBotShadow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writes.length = 0;
    mocks.newer = null;
    mocks.lastBot = null;
    mocks.realRows = [];
    mocks.productCount = 9;
    mocks.botEnabled.mockResolvedValue(true);
    mocks.pending.mockResolvedValue(null);
    mocks.create.mockResolvedValue({});
    mocks.classify.mockResolvedValue({
      ok: true,
      value: { intent: "product", productIntent: "search", query: "harry potter", filters: { theme: null, category: null, recipient: null, budget: null } },
    });
  });

  const assertNothingSent = () => {
    expect(Object.keys(mocks.send).length).toBeGreaterThan(3);
    for (const [name, fn] of Object.entries(mocks.send)) expect(fn, name).not.toHaveBeenCalled();
  };

  it("planea, nunca envía y solo escribe su propia fila, sin el wamid ni el texto", async () => {
    mocks.realRows = [{ body: "Esa no me la sé", metadata: null }];
    await runWhatsAppBotShadow(candidate, "escalated_no_match", new Date(), deps);
    assertNothingSent();
    expect(mocks.writes).toEqual(["whatsAppBotShadowRun.create"]);
    const { data } = mocks.create.mock.calls[0][0];
    expect(data).toMatchObject({
      inboundMessageId: "msg-1",
      intent: "product",
      plannedTypes: ["product_list"],
      plannedCount: 1,
      productsFound: true,
      searchRan: true,
      realOutcome: "escalated_no_match",
      realTypes: ["handoff"],
      realCount: 1,
      classifierStatus: "ok",
      skipReason: null,
    });
    expect(JSON.stringify(data)).not.toMatch(/harry|wamid|570000000000/i);
  });

  it("con un mensaje más nuevo no gasta la llamada a la IA y planea silencio", async () => {
    mocks.newer = { id: "msg-2" };
    await runWhatsAppBotShadow(candidate, "replied_product", new Date(), deps);
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ plannedTypes: [], skipReason: "superseded", classifierStatus: "skipped" });
    assertNothingSent();
  });

  it("si la IA no responde, guarda el fallo y sigue sin tocar al bot real", async () => {
    mocks.classify.mockResolvedValue({ ok: false, reason: "timeout" });
    await runWhatsAppBotShadow({ ...candidate, body: "hola, una pregunta" }, "replied", new Date(), deps);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ classifierStatus: "timeout", intent: null });
    assertNothingSent();
  });

  it("un fallo se traga y se anota solo con su tipo", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.create.mockRejectedValue(new Error("fila con datos sensibles: harry potter"));
    await expect(runWhatsAppBotShadow(candidate, "replied", new Date(), deps)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[WHATSAPP_SHADOW] Falló el modo sombra", { conversationId: "conv-1", stage: "record", kind: "Error" });
    assertNothingSent();
  });

  it("los toques de botón y los adjuntos no pasan por la sombra", async () => {
    await runWhatsAppBotShadow({ ...candidate, interactiveReplyId: "b1" }, "replied", new Date(), deps);
    await runWhatsAppBotShadow({ ...candidate, mediaForOwner: true }, "escalated_unprocessable_media", new Date(), deps);
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(mocks.writes).toEqual([]);
  });
});

describe("qué mandó el bot real", () => {
  it("reconoce la bienvenida, los productos, el aviso de espera y el «Esa no me la sé»", () => {
    expect(realTypesFrom([{ body: "Hola", metadata: { kind: "welcome" } }], "replied_business_fact")).toEqual(["welcome"]);
    expect(
      realTypesFrom(
        [
          { body: "Dame un segundito", metadata: null },
          { body: "Tenemos…", metadata: { shown: { ids: ["p1"] } } },
        ],
        "replied_product",
      ),
    ).toEqual(["wait_notice", "product_list"]);
    expect(realTypesFrom([{ body: "No lo tengo", metadata: { decision: { outcome: "unsure" } } }], "replied_product_unsure")).toEqual(["handoff"]);
    expect(realTypesFrom([{ body: "Esa no me la sé", metadata: null }], "escalated_no_match")).toEqual(["handoff"]);
    expect(realTypesFrom([{ body: "Abrimos de 9 a 6", metadata: null }], "replied_business_fact")).toEqual(["fact"]);
    expect(realTypesFrom([{ body: "¡Listo!", metadata: { orderRequest: { status: "pending", items: [] } } }], "replied_order_request")).toEqual(["order_request"]);
    expect(realTypesFrom([{ body: "Lo sumo", metadata: { orderRequest: { status: "pending", items: [] } } }], "replied_order_appended")).toEqual(["order_append"]);
    expect(realTypesFrom([{ body: "El valor del envío…", metadata: null }], "replied_shipping_quote")).toEqual(["shipping_quote"]);
  });
});

describe("informe de 7 días", () => {
  it("compara mensajes por mensaje y cuenta los «Esa no me la sé» donde la sombra sí encontraba", () => {
    const report = summarizeShadowRuns([
      { intent: "product", plannedCount: 1, realCount: 1, realOutcome: "escalated_no_match", productsFound: true, classifierStatus: "ok", skipReason: null },
      { intent: null, plannedCount: 0, realCount: 2, realOutcome: "replied_business_fact", productsFound: null, classifierStatus: "skipped", skipReason: "superseded" },
      { intent: null, plannedCount: 1, realCount: 1, realOutcome: "replied", productsFound: null, classifierStatus: "timeout", skipReason: null },
    ]);
    expect(report).toMatchObject({
      evaluated: 3,
      realPerInbound: 1.33,
      shadowPerInbound: 0.67,
      realNoMatch: 1,
      realNoMatchShadowFound: 1,
      classifierFailures: 1,
      silences: [{ reason: "superseded", count: 1 }],
    });
  });
});

describe("la sombra no puede enviar", () => {
  it("ningún archivo de lib/whatsapp/shadow importa el envío, el bot real ni la sincronización", () => {
    const dir = path.resolve(__dirname, "../../../lib/whatsapp/shadow");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/from "@\/lib\/whatsapp\/(send|bot|conversation-sync)"/);
    }
  });
});
