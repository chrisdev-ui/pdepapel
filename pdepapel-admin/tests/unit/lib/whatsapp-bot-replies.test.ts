import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: {
    whatsAppBotReply: { findMany: mocks.findMany, findFirst: mocks.findFirst },
  },
}));

import {
  BOT_REPLY_MAX_TRIGGERS,
  buildButtonId,
  getActiveBotKeywords,
  getSendableBotReply,
  isBotReplySendable,
  parseStoredButtons,
  readButtonTarget,
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
      { id: "r1", label: "Horarios", triggers: ["horario"], answer: "De 9 a 6.", buttons: null, approvedAt: null, isActive: true },
    ]);

    await expect(getActiveBotKeywords("store-1")).resolves.toEqual([
      { id: "r1", label: "Horarios", triggers: ["horario"], answer: "De 9 a 6.", buttons: [] },
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        label: true,
        triggers: true,
        answer: true,
        buttons: true,
        approvedAt: true,
        isActive: true,
      },
    });
  });

  it("drops a reply whose triggers got corrupted rather than matching everything", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "r1", label: "Rota", triggers: "no-es-una-lista", answer: "hola", buttons: null, approvedAt: null, isActive: true },
      { id: "r2", label: "Buena", triggers: ["envio"], answer: "Enviamos a todo el país.", buttons: null, approvedAt: null, isActive: true },
    ]);

    await expect(getActiveBotKeywords("store-1")).resolves.toEqual([
      { id: "r2", label: "Buena", triggers: ["envio"], answer: "Enviamos a todo el país.", buttons: [] },
    ]);
  });

  it("no manda un menú sin aprobar, pero sí una respuesta sin botones", async () => {
    const buttons = [{ title: "Ver horarios", targetReplyId: "r9" }];
    mocks.findMany.mockResolvedValue([
      { id: "r1", label: "Menú sin aprobar", triggers: ["hola"], answer: "¿Qué buscas?", buttons, approvedAt: null, isActive: true },
      { id: "r2", label: "Menú aprobado", triggers: ["menu"], answer: "Mira:", buttons, approvedAt: new Date(), isActive: true },
      { id: "r3", label: "Sin botones", triggers: ["envio"], answer: "Enviamos.", buttons: null, approvedAt: null, isActive: true },
    ]);

    const result = await getActiveBotKeywords("store-1");

    expect(result.map((reply) => reply.label)).toEqual(["Menú aprobado", "Sin botones"]);
  });

  it("returns nothing while the store has no replies, which keeps the bot silent", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(getActiveBotKeywords("store-1")).resolves.toEqual([]);
  });
});

describe("aprobación de menús", () => {
  it("solo exige el visto bueno cuando la respuesta lleva botones", () => {
    const buttons = [{ title: "Ver", targetReplyId: "r1" }];

    expect(isBotReplySendable({ isActive: true, buttons: null, approvedAt: null })).toBe(true);
    expect(isBotReplySendable({ isActive: true, buttons, approvedAt: null })).toBe(false);
    expect(isBotReplySendable({ isActive: true, buttons, approvedAt: new Date() })).toBe(true);
    // Apagada no se manda, esté aprobada o no.
    expect(isBotReplySendable({ isActive: false, buttons, approvedAt: new Date() })).toBe(false);
  });
});

describe("getSendableBotReply", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve la respuesta a la que apunta un botón", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "r2", label: "Envíos", answer: "Enviamos.", buttons: null, approvedAt: null, isActive: true,
    });

    await expect(getSendableBotReply("store-1", "r2")).resolves.toEqual({
      id: "r2",
      label: "Envíos",
      // Se llega por botón, no por frase.
      triggers: [],
      answer: "Enviamos.",
      buttons: [],
    });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r2", storeId: "store-1" } }),
    );
  });

  it("no devuelve nada si está apagada, sin aprobar o es de otra tienda", async () => {
    mocks.findFirst.mockResolvedValue({ id: "r2", label: "X", answer: "a", buttons: null, approvedAt: null, isActive: false });
    await expect(getSendableBotReply("store-1", "r2")).resolves.toBeNull();

    mocks.findFirst.mockResolvedValue({
      id: "r2", label: "X", answer: "a", buttons: [{ title: "Ver", targetReplyId: "r9" }], approvedAt: null, isActive: true,
    });
    await expect(getSendableBotReply("store-1", "r2")).resolves.toBeNull();

    mocks.findFirst.mockResolvedValue(null);
    await expect(getSendableBotReply("store-1", "r2")).resolves.toBeNull();
  });
});

describe("ids de botón", () => {
  it("van y vuelven sin perder a qué respuesta apuntan", () => {
    expect(readButtonTarget(buildButtonId("abc-123"))).toBe("abc-123");
  });

  it("un id que no es de menú no apunta a ninguna respuesta", () => {
    for (const value of ["owner", "", null, undefined, "r:", "otra-cosa"]) {
      expect(readButtonTarget(value)).toBeNull();
    }
  });
});

describe("parseStoredButtons", () => {
  it("ignora lo que no tenga texto y destino", () => {
    expect(
      parseStoredButtons([
        { title: "Ver horarios", targetReplyId: "r1" },
        { title: "", targetReplyId: "r2" },
        { title: "Sin destino" },
        "no es un objeto",
      ]),
    ).toEqual([{ title: "Ver horarios", targetReplyId: "r1" }]);
  });

  it("no deja pasar más de dos: el tercer botón es el de Paula", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ title: `B${i}`, targetReplyId: `r${i}` }));
    expect(parseStoredButtons(many)).toHaveLength(2);
  });

  it("devuelve vacío para cualquier basura", () => {
    for (const value of [null, undefined, "nope", 5, {}]) {
      expect(parseStoredButtons(value)).toEqual([]);
    }
  });
});
