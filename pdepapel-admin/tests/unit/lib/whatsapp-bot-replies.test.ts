import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: { whatsAppBotReply: { findMany: mocks.findMany } },
}));

import {
  BOT_REPLY_MAX_TRIGGERS,
  getActiveBotKeywords,
  parseBotReplyInput,
  parseStoredTriggers,
  parseTriggerLines,
  triggersToLines,
} from "@/lib/whatsapp/bot-replies";

describe("parseTriggerLines", () => {
  it("splits on lines or commas, normalizes accents and case, and deduplicates", () => {
    expect(parseTriggerLines("Horario\n¿A QUÉ HORA?\nhorario\n  \nEnvío, Domicilio")).toEqual([
      "horario",
      "¿a que hora?",
      "envio",
      "domicilio",
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(parseTriggerLines("   \n\n  ")).toEqual([]);
  });

  it("caps how many triggers one reply can hold", () => {
    const many = Array.from({ length: 60 }, (_, i) => `frase ${i}`).join("\n");
    expect(parseTriggerLines(many)).toHaveLength(BOT_REPLY_MAX_TRIGGERS);
  });

  it("round-trips through the textarea format", () => {
    const triggers = parseTriggerLines("horario\nenvio");
    expect(triggersToLines(triggers)).toBe("horario\nenvio");
  });
});

describe("parseBotReplyInput", () => {
  const valid = {
    label: "Horarios",
    triggers: ["Horario", "¿A qué hora?"],
    answer: "Atendemos de lunes a sábado.",
    isActive: true,
    sortOrder: 0,
  };

  it("normalizes the triggers before they are stored", () => {
    expect(parseBotReplyInput(valid).triggers).toEqual(["horario", "¿a que hora?"]);
  });

  it("defaults a new reply to active and first in order", () => {
    const parsed = parseBotReplyInput({ label: "X", triggers: ["hola"], answer: "hey" });
    expect(parsed.isActive).toBe(true);
    expect(parsed.sortOrder).toBe(0);
  });

  it("refuses a reply with no name, no trigger or no answer", () => {
    expect(() => parseBotReplyInput({ ...valid, label: "  " })).toThrow();
    expect(() => parseBotReplyInput({ ...valid, triggers: [] })).toThrow();
    expect(() => parseBotReplyInput({ ...valid, answer: "" })).toThrow();
  });

  it("refuses an answer too long to send as one WhatsApp message", () => {
    expect(() => parseBotReplyInput({ ...valid, answer: "a".repeat(1001) })).toThrow();
  });

  it("refuses triggers that normalize away to nothing", () => {
    expect(() => parseBotReplyInput({ ...valid, triggers: ["   ", "\n"] })).toThrow();
  });
});

describe("parseStoredTriggers", () => {
  it("ignores anything that is not a usable string", () => {
    expect(parseStoredTriggers(["horario", "", 5, null, "envio"])).toEqual(["horario", "envio"]);
    expect(parseStoredTriggers("nope")).toEqual([]);
    expect(parseStoredTriggers(null)).toEqual([]);
  });
});

describe("getActiveBotKeywords", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads only the active replies of the store, in the order the bot tries them", async () => {
    mocks.findMany.mockResolvedValue([
      { label: "Horarios", triggers: ["horario"], answer: "De 9 a 6." },
    ]);

    await expect(getActiveBotKeywords("store-1")).resolves.toEqual([
      { label: "Horarios", triggers: ["horario"], answer: "De 9 a 6." },
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { label: true, triggers: true, answer: true },
    });
  });

  it("drops a reply whose triggers got corrupted rather than matching everything", async () => {
    mocks.findMany.mockResolvedValue([
      { label: "Rota", triggers: "no-es-una-lista", answer: "hola" },
      { label: "Buena", triggers: ["envio"], answer: "Enviamos a todo el país." },
    ]);

    await expect(getActiveBotKeywords("store-1")).resolves.toEqual([
      { label: "Buena", triggers: ["envio"], answer: "Enviamos a todo el país." },
    ]);
  });

  it("returns nothing while the store has no replies, which keeps the bot silent", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(getActiveBotKeywords("store-1")).resolves.toEqual([]);
  });
});
