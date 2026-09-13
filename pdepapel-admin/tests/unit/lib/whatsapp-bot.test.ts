import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  send: vi.fn(),
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
vi.mock("@/lib/whatsapp/send", () => ({ sendWhatsAppTextMessage: mocks.send }));

import {
  WHATSAPP_BOT_MARKER,
  formatBotReply,
  matchWhatsAppKeyword,
  normalizeBotText,
  runWhatsAppBot,
} from "@/lib/whatsapp/bot";

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
    mocks.conversationFindUnique.mockResolvedValue({ id: "conversation-1", status: "OPEN" });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.messageCreate.mockResolvedValue({});
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
  });

  it("answers a keyword match with the automatic marker and files it as BOT", async () => {
    await expect(runWhatsAppBot(input)).resolves.toEqual({ outcome: "replied", trigger: "horario" });

    expect(mocks.send).toHaveBeenCalledWith("573001234567", `${WHATSAPP_BOT_MARKER}\n\nAbrimos de 9 a 6.`);
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

  it("never answers twice in a row: escalates when the last outbound was the bot", async () => {
    mocks.messageFindFirst.mockResolvedValue({ sentBy: "BOT" });

    await expect(runWhatsAppBot(input)).resolves.toEqual({ outcome: "escalated_bot_already_replied" });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: { conversationId: "conversation-1", direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      select: { sentBy: true },
    });
  });

  it("answers again after a person replied from the phone", async () => {
    mocks.messageFindFirst.mockResolvedValue({ sentBy: "OWNER" });

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

  it("does nothing when the conversation vanished", async () => {
    mocks.conversationFindUnique.mockResolvedValue(null);

    await expect(runWhatsAppBot(input)).resolves.toEqual({ outcome: "skipped_needs_owner" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
