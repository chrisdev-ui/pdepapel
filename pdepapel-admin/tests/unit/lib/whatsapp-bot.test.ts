import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  send: vi.fn(),
  activeKeywords: vi.fn(),
  sendableReply: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    conversation: {
      findUnique: mocks.conversationFindUnique,
      update: mocks.conversationUpdate,
    },
    conversationMessage: {
      findFirst: mocks.messageFindFirst,
      create: mocks.messageCreate,
    },
  },
}));
vi.mock("@/lib/whatsapp/send", () => ({ sendWhatsAppButtonMessage: mocks.send }));
// Los ayudantes puros (ids de botón, constantes) se dejan reales: son la
// misma lógica que corre en producción y no tocan la base de datos.
vi.mock("@/lib/whatsapp/bot-replies", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/bot-replies")>()),
  getActiveBotKeywords: mocks.activeKeywords,
  getSendableBotReply: mocks.sendableReply,
}));

import {
  TALK_TO_OWNER_ACKNOWLEDGEMENT,
  WHATSAPP_BOT_MARKER,
  buildReplyButtons,
  formatBotReply,
  matchWhatsAppKeyword,
  normalizeBotText,
  runWhatsAppBot,
} from "@/lib/whatsapp/bot";
import {
  TALK_TO_OWNER_BUTTON_ID,
  TALK_TO_OWNER_BUTTON_TITLE,
} from "@/lib/whatsapp/bot-replies";

/** Todo mensaje del bot sale con este botón de escape al final. */
const ESCAPE = [{ id: TALK_TO_OWNER_BUTTON_ID, title: TALK_TO_OWNER_BUTTON_TITLE }];

const keywords = [
  { triggers: ["horario", "a que hora"], answer: "Abrimos de 9 a 6." },
  { triggers: ["envio", "domicilio"], answer: "Enviamos a todo el país." },
];

const input = {
  conversationId: "conversation-1",
  phone: "573001234567",
  body: "¿Cuál es el horario?",
  keywords,
};

describe("keyword matching", () => {
  it("ignores case and accents, using the same pattern as slugify", () => {
    expect(normalizeBotText("¿A QUÉ HORA  abren?")).toBe("¿a que hora abren?");
    expect(matchWhatsAppKeyword("¿A QUÉ HORA abren?", keywords)?.keyword.answer).toBe("Abrimos de 9 a 6.");
    expect(matchWhatsAppKeyword("necesito un ENVÍO", keywords)?.keyword.answer).toBe("Enviamos a todo el país.");
  });

  it("takes the first entry that matches and returns null when none does", () => {
    const both = [
      { triggers: ["horario"], answer: "primera" },
      { triggers: ["horario"], answer: "segunda" },
    ];
    expect(matchWhatsAppKeyword("horario", both)?.keyword.answer).toBe("primera");
    expect(matchWhatsAppKeyword("quiero un cuaderno rosado", keywords)).toBeNull();
    expect(matchWhatsAppKeyword("   ", keywords)).toBeNull();
  });

  it("marks every automated reply as automatic", () => {
    expect(formatBotReply("Abrimos de 9 a 6.")).toBe(`${WHATSAPP_BOT_MARKER}\n\nAbrimos de 9 a 6.`);
    expect(WHATSAPP_BOT_MARKER).toContain("automática");
  });
});

describe("runWhatsAppBot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.conversationFindUnique.mockResolvedValue({ id: "conversation-1", status: "OPEN", storeId: "store-1" });
    mocks.activeKeywords.mockResolvedValue(keywords);
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.messageCreate.mockResolvedValue({});
    mocks.sendableReply.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
  });

  it("answers a keyword match with the automatic marker and files it as BOT", async () => {
    await expect(runWhatsAppBot(input)).resolves.toEqual({ outcome: "replied", trigger: "horario" });

    expect(mocks.send).toHaveBeenCalledWith(
      "573001234567",
      `${WHATSAPP_BOT_MARKER}\n\nAbrimos de 9 a 6.`,
      ESCAPE,
    );
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conversation-1",
        direction: "OUTBOUND",
        sentBy: "BOT",
        externalId: "wamid.BOT1",
        status: "SENT",
      }),
    });
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { lastOutboundAt: expect.any(Date) },
    });
  });

  it("stays silent once the conversation is waiting for a person", async () => {
    mocks.conversationFindUnique.mockResolvedValue({ id: "conversation-1", status: "NEEDS_OWNER" });

    await expect(runWhatsAppBot(input)).resolves.toEqual({ outcome: "skipped_needs_owner" });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    // No vuelve a escalar algo que ya está escalado.
    expect(mocks.conversationUpdate).not.toHaveBeenCalled();
  });

  it("answers again even if the last message was also the bot", async () => {
    // La regla de «nunca dos automáticas seguidas» se quitó el 2026-09-14: la
    // clienta puede seguir con el bot porque siempre ve el botón de salida.
    mocks.messageFindFirst.mockResolvedValue({ sentBy: "BOT" });

    await expect(runWhatsAppBot(input)).resolves.toMatchObject({ outcome: "replied" });
    expect(mocks.send).toHaveBeenCalled();
  });

  it("sends nothing and escalates when no keyword matches", async () => {
    await expect(
      runWhatsAppBot({ ...input, body: "quiero un cuaderno rosado" }),
    ).resolves.toEqual({ outcome: "escalated_no_match" });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
  });

  it("records a failed send as FAILED, escalates and never retries", async () => {
    mocks.send.mockResolvedValue({ ok: false, error: "not configured" });

    await expect(runWhatsAppBot(input)).resolves.toEqual({
      outcome: "escalated_send_failed",
      trigger: "horario",
      error: "not configured",
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: {
        conversationId: "conversation-1",
        direction: "OUTBOUND",
        sentBy: "BOT",
        body: `${WHATSAPP_BOT_MARKER}\n\nAbrimos de 9 a 6.`,
        status: "FAILED",
      },
    });
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
  });

  it("reads the store's replies when the caller does not pass any", async () => {
    const { keywords: _ignored, ...withoutKeywords } = input;
    await expect(runWhatsAppBot(withoutKeywords)).resolves.toMatchObject({ outcome: "replied" });
    expect(mocks.activeKeywords).toHaveBeenCalledWith("store-1");
  });

  it("stays silent and escalates while the store has no replies defined", async () => {
    // Es el estado en el que nace la tabla: sin respuestas, el bot calla.
    mocks.activeKeywords.mockResolvedValue([]);
    const { keywords: _ignored, ...withoutKeywords } = input;

    await expect(runWhatsAppBot(withoutKeywords)).resolves.toEqual({ outcome: "escalated_no_match" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
  });

  it("does nothing when the conversation vanished", async () => {
    mocks.conversationFindUnique.mockResolvedValue(null);

    await expect(runWhatsAppBot(input)).resolves.toEqual({ outcome: "skipped_needs_owner" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("botón «Hablar con Paula»", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.conversationFindUnique.mockResolvedValue({ id: "conversation-1", status: "OPEN", storeId: "store-1" });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageCreate.mockResolvedValue({});
    mocks.sendableReply.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
  });

  it("va siempre de último, aunque la respuesta no tenga menú", () => {
    expect(buildReplyButtons(undefined)).toEqual(ESCAPE);
    expect(buildReplyButtons([{ title: "Ver horarios", targetReplyId: "abc" }])).toEqual([
      { id: "r:abc", title: "Ver horarios" },
      ...ESCAPE,
    ]);
  });

  it("confirma y deja la conversación para Paula", async () => {
    await expect(
      runWhatsAppBot({ ...input, interactiveReplyId: TALK_TO_OWNER_BUTTON_ID }),
    ).resolves.toEqual({ outcome: "escalated_owner_requested" });

    expect(mocks.send).toHaveBeenCalledWith(
      "573001234567",
      `${WHATSAPP_BOT_MARKER}\n\n${TALK_TO_OWNER_ACKNOWLEDGEMENT}`,
      // El acuse no lleva menú, pero sí la salida: nunca se manda sin botones.
      ESCAPE,
    );
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
  });

  it("gana sobre las palabras clave: no contesta el menú y llama a Paula", async () => {
    // El cuerpo dice «horario», que sí tiene respuesta. El botón manda.
    await expect(
      runWhatsAppBot({ ...input, interactiveReplyId: TALK_TO_OWNER_BUTTON_ID }),
    ).resolves.toMatchObject({ outcome: "escalated_owner_requested" });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toContain(TALK_TO_OWNER_ACKNOWLEDGEMENT);
  });
});

describe("menús por botón", () => {
  const menu = [
    { id: "reply-horarios", triggers: ["horario"], answer: "Abrimos de 9 a 6.", buttons: [] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.conversationFindUnique.mockResolvedValue({ id: "conversation-1", status: "OPEN", storeId: "store-1" });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageCreate.mockResolvedValue({});
    mocks.sendableReply.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
  });

  it("sirve la respuesta a la que apunta el botón, sin mirar el texto", async () => {
    await expect(
      runWhatsAppBot({
        ...input,
        // El texto no coincide con nada; el botón sí sabe a dónde va.
        body: "Ver horarios",
        interactiveReplyId: "r:reply-horarios",
        keywords: menu,
      }),
    ).resolves.toEqual({ outcome: "replied" });

    expect(mocks.send).toHaveBeenCalledWith(
      "573001234567",
      `${WHATSAPP_BOT_MARKER}\n\nAbrimos de 9 a 6.`,
      ESCAPE,
    );
  });

  it("despierta al bot aunque la conversación esté esperando a Paula", async () => {
    // Tocar un botón es la clienta eligiendo al bot a propósito.
    mocks.conversationFindUnique.mockResolvedValue({ id: "conversation-1", status: "NEEDS_OWNER", storeId: "store-1" });

    await expect(
      runWhatsAppBot({ ...input, interactiveReplyId: "r:reply-horarios", keywords: menu }),
    ).resolves.toMatchObject({ outcome: "replied" });
  });

  it("un mensaje escrito NO la despierta", async () => {
    mocks.conversationFindUnique.mockResolvedValue({ id: "conversation-1", status: "NEEDS_OWNER", storeId: "store-1" });

    await expect(runWhatsAppBot({ ...input, keywords: menu })).resolves.toEqual({
      outcome: "skipped_needs_owner",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("llama a Paula si el botón apunta a algo borrado, apagado o sin aprobar", async () => {
    await expect(
      runWhatsAppBot({ ...input, interactiveReplyId: "r:ya-no-existe", keywords: menu }),
    ).resolves.toEqual({ outcome: "escalated_button_unavailable" });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
  });

  it("busca la respuesta en la tienda cuando no se le pasan de fuera", async () => {
    mocks.sendableReply.mockResolvedValue({
      id: "reply-envios",
      triggers: [],
      answer: "Enviamos a todo el país.",
      buttons: [{ title: "Ver catálogo", targetReplyId: "reply-catalogo" }],
    });
    const { keywords: _ignored, ...withoutKeywords } = input;

    await expect(
      runWhatsAppBot({ ...withoutKeywords, interactiveReplyId: "r:reply-envios" }),
    ).resolves.toMatchObject({ outcome: "replied" });

    expect(mocks.sendableReply).toHaveBeenCalledWith("store-1", "reply-envios");
    expect(mocks.send).toHaveBeenCalledWith(
      "573001234567",
      `${WHATSAPP_BOT_MARKER}\n\nEnviamos a todo el país.`,
      [{ id: "r:reply-catalogo", title: "Ver catálogo" }, ...ESCAPE],
    );
  });
});
