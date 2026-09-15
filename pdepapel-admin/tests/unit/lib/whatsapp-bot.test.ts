import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  send: vi.fn(),
  typing: vi.fn(),
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
vi.mock("@/lib/whatsapp/send", () => ({
  sendWhatsAppButtonMessage: mocks.send,
  sendWhatsAppTypingIndicator: mocks.typing,
}));
// Los ayudantes puros (ids de botón, constantes) se dejan reales: son la
// misma lógica que corre en producción y no tocan la base de datos.
vi.mock("@/lib/whatsapp/bot-replies", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/bot-replies")>()),
  getActiveBotKeywords: mocks.activeKeywords,
  getSendableBotReply: mocks.sendableReply,
}));

import {
  HUMAN_PAUSE_MAX_MS,
  HUMAN_PAUSE_READ_MS,
  NO_MATCH_ACKNOWLEDGEMENT,
  TALK_TO_OWNER_ACKNOWLEDGEMENT,
  UNAVAILABLE_OPTION_ACKNOWLEDGEMENT,
  buildReplyButtons,
  formatBotReply,
  getHumanPauseMs,
  matchWhatsAppKeyword,
  normalizeBotText,
  runWhatsAppBot,
} from "@/lib/whatsapp/bot";
import {
  TALK_TO_OWNER_BUTTON_ID,
  TALK_TO_OWNER_BUTTON_TITLE,
} from "@/lib/whatsapp/bot-replies";

/** Todo mensaje del bot sale con este botón de escape al final. */
const ESCAPE = [
  { id: TALK_TO_OWNER_BUTTON_ID, title: TALK_TO_OWNER_BUTTON_TITLE },
];

const keywords = [
  { triggers: ["horario", "a que hora"], answer: "Abrimos de 9 a 6." },
  { triggers: ["envio", "domicilio"], answer: "Enviamos a todo el país." },
];

const input = {
  conversationId: "conversation-1",
  phone: "573001234567",
  body: "¿Cuál es el horario?",
  keywords,
  // Sin esto cada prueba esperaría la pausa humana de verdad.
  skipHumanPause: true,
};

describe("keyword matching", () => {
  it("ignores case and accents, using the same pattern as slugify", () => {
    expect(normalizeBotText("¿A QUÉ HORA  abren?")).toBe("¿a que hora abren?");
    expect(
      matchWhatsAppKeyword("¿A QUÉ HORA abren?", keywords)?.keyword.answer,
    ).toBe("Abrimos de 9 a 6.");
    expect(
      matchWhatsAppKeyword("necesito un ENVÍO", keywords)?.keyword.answer,
    ).toBe("Enviamos a todo el país.");
  });

  it("takes the first entry that matches and returns null when none does", () => {
    const both = [
      { triggers: ["horario"], answer: "primera" },
      { triggers: ["horario"], answer: "segunda" },
    ];
    expect(matchWhatsAppKeyword("horario", both)?.keyword.answer).toBe(
      "primera",
    );
    expect(
      matchWhatsAppKeyword("quiero un cuaderno rosado", keywords),
    ).toBeNull();
    expect(matchWhatsAppKeyword("   ", keywords)).toBeNull();
  });

  it("manda la respuesta tal cual, sin encabezado de robot", () => {
    // Paula lo pidió el 2026-09-14: que se lea como si escribiera ella.
    expect(formatBotReply("Abrimos de 9 a 6.")).toBe("Abrimos de 9 a 6.");
    expect(formatBotReply("Abrimos de 9 a 6.")).not.toContain("🤖");
  });

  it("limpia el encabezado viejo de una respuesta guardada antes del cambio", () => {
    expect(formatBotReply("🤖 Respuesta automática\n\nAbrimos de 9 a 6.")).toBe(
      "Abrimos de 9 a 6.",
    );
  });
});

describe("runWhatsAppBot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      status: "OPEN",
      storeId: "store-1",
    });
    mocks.activeKeywords.mockResolvedValue(keywords);
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.messageCreate.mockResolvedValue({});
    mocks.sendableReply.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
    mocks.typing.mockResolvedValue({ ok: true });
  });

  it("answers a keyword match with the automatic marker and files it as BOT", async () => {
    await expect(runWhatsAppBot(input)).resolves.toEqual({
      outcome: "replied",
      trigger: "horario",
    });

    expect(mocks.send).toHaveBeenCalledWith(
      "573001234567",
      "Abrimos de 9 a 6.",
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
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      status: "NEEDS_OWNER",
    });

    await expect(runWhatsAppBot(input)).resolves.toEqual({
      outcome: "skipped_needs_owner",
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    // No vuelve a escalar algo que ya está escalado.
    expect(mocks.conversationUpdate).not.toHaveBeenCalled();
  });

  it("answers again even if the last message was also the bot", async () => {
    // La regla de «nunca dos automáticas seguidas» se quitó el 2026-09-14: la
    // clienta puede seguir con el bot porque siempre ve el botón de salida.
    await expect(runWhatsAppBot(input)).resolves.toMatchObject({
      outcome: "replied",
    });
    expect(mocks.send).toHaveBeenCalled();
  });

  describe("freno de mano: hilos donde Paula ya escribió", () => {
    /** Lo que devuelve la consulta del freno cuando sí hay un mensaje suyo. */
    const deOwner = { id: "message-owner-1" };

    it("no manda nada si Paula ya había escrito en la conversación", async () => {
      mocks.messageFindFirst.mockResolvedValue(deOwner);

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "skipped_owner_thread",
      });

      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.typing).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
      // Tampoco toca el estado: la conversación ya es de ella.
      expect(mocks.conversationUpdate).not.toHaveBeenCalled();
    });

    it("pregunta solo por mensajes de Paula, no del bot ni de la clienta", async () => {
      mocks.messageFindFirst.mockResolvedValue(deOwner);

      await runWhatsAppBot(input);

      expect(mocks.messageFindFirst).toHaveBeenCalledWith({
        where: { conversationId: "conversation-1", sentBy: "OWNER" },
        select: { id: true },
      });
    });

    it("calla incluso si la clienta toca «Hablar con Paula»", async () => {
      // Sin el freno esto mandaría el acuse encima de una conversación que
      // ella ya está llevando.
      mocks.messageFindFirst.mockResolvedValue(deOwner);

      await expect(
        runWhatsAppBot({ ...input, interactiveReplyId: TALK_TO_OWNER_BUTTON_ID }),
      ).resolves.toEqual({ outcome: "skipped_owner_thread" });

      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.conversationUpdate).not.toHaveBeenCalled();
    });

    it("el caso Chuchu: Paula escribe y la otra persona sigue escribiendo", async () => {
      // Los 5 mensajes que el bot mandó de verdad en producción eran este
      // caso: un hilo suyo, ella contestando, y el bot metiéndose entre medias
      // con «Esa no me la sé» porque el eco de su celular dejaba el estado en
      // OPEN. Ahora ninguno de los dos mensajes de la otra persona lo despierta.
      mocks.messageFindFirst.mockResolvedValue(deOwner);

      const primero = await runWhatsAppBot({
        ...input,
        body: "Si supera los 0,5 metros cúbicos, ya no puede considerarse una muestra.",
      });
      const segundo = await runWhatsAppBot({
        ...input,
        body: "Si tu primo lo necesita, quizá la próxima vez podamos incluir…",
      });

      expect(primero).toEqual({ outcome: "skipped_owner_thread" });
      expect(segundo).toEqual({ outcome: "skipped_owner_thread" });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("una conversación nueva sin nada de Paula sigue igual que antes", async () => {
      // El freno no puede apagar el bot donde sí hace falta: sin mensajes
      // suyos, tanto la coincidencia como el aviso de «no sé» siguen saliendo.
      mocks.messageFindFirst.mockResolvedValue(null);

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "replied",
        trigger: "horario",
      });
      expect(mocks.send).toHaveBeenCalledWith(
        "573001234567",
        "Abrimos de 9 a 6.",
        ESCAPE,
      );

      vi.clearAllMocks();
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "OPEN",
        storeId: "store-1",
      });
      mocks.messageFindFirst.mockResolvedValue(null);
      mocks.conversationUpdate.mockResolvedValue({});
      mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT2" });
      mocks.typing.mockResolvedValue({ ok: true });

      await expect(
        runWhatsAppBot({ ...input, body: "quiero un cuaderno rosado" }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });
  });

  it("avisa que no sabe y escala cuando ninguna palabra clave coincide", async () => {
    // Antes no contestaba nada y la clienta se quedaba sin saber si su
    // mensaje llegó.
    await expect(
      runWhatsAppBot({ ...input, body: "quiero un cuaderno rosado" }),
    ).resolves.toEqual({ outcome: "escalated_no_match" });

    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
  });

  it("marca la conversación ANTES de avisar, para no avisar dos veces", async () => {
    // Durante la pausa humana puede entrar otro mensaje: si la conversación
    // no estuviera marcada ya, ese segundo mensaje avisaría otra vez.
    const orden: string[] = [];
    mocks.conversationUpdate.mockImplementation(
      async (args: { data?: { status?: string } }) => {
        if (args.data?.status === "NEEDS_OWNER") orden.push("escala");
        return {};
      },
    );
    mocks.send.mockImplementation(async () => {
      orden.push("avisa");
      return { ok: true, externalId: "wamid.ack" };
    });

    await runWhatsAppBot({ ...input, body: "algo que nadie configuró" });

    expect(orden).toEqual(["escala", "avisa"]);
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
        body: "Abrimos de 9 a 6.",
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
    await expect(runWhatsAppBot(withoutKeywords)).resolves.toMatchObject({
      outcome: "replied",
    });
    expect(mocks.activeKeywords).toHaveBeenCalledWith("store-1");
  });

  it("avisa igual mientras la tienda no tenga respuestas definidas", async () => {
    // Es el estado en el que nace la tabla.
    mocks.activeKeywords.mockResolvedValue([]);
    const { keywords: _ignored, ...withoutKeywords } = input;

    await expect(runWhatsAppBot(withoutKeywords)).resolves.toEqual({
      outcome: "escalated_no_match",
    });
    // Sin respuestas configuradas igual contesta que le pasa el mensaje a
    // Paula: es el estado en el que está la tienda hoy.
    expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: "conversation-1" },
      data: { status: "NEEDS_OWNER" },
    });
  });

  it("does nothing when the conversation vanished", async () => {
    mocks.conversationFindUnique.mockResolvedValue(null);

    await expect(runWhatsAppBot(input)).resolves.toEqual({
      outcome: "skipped_needs_owner",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("botón «Hablar con Paula»", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      status: "OPEN",
      storeId: "store-1",
    });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageCreate.mockResolvedValue({});
    mocks.sendableReply.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
    mocks.typing.mockResolvedValue({ ok: true });
  });

  it("va siempre de último, aunque la respuesta no tenga menú", () => {
    expect(buildReplyButtons(undefined)).toEqual(ESCAPE);
    expect(
      buildReplyButtons([{ title: "Ver horarios", targetReplyId: "abc" }]),
    ).toEqual([{ id: "r:abc", title: "Ver horarios" }, ...ESCAPE]);
  });

  it("confirma y deja la conversación para Paula", async () => {
    await expect(
      runWhatsAppBot({ ...input, interactiveReplyId: TALK_TO_OWNER_BUTTON_ID }),
    ).resolves.toEqual({ outcome: "escalated_owner_requested" });

    expect(mocks.send).toHaveBeenCalledWith(
      "573001234567",
      TALK_TO_OWNER_ACKNOWLEDGEMENT,
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
    expect(mocks.send.mock.calls[0][1]).toContain(
      TALK_TO_OWNER_ACKNOWLEDGEMENT,
    );
  });
});

describe("menús por botón", () => {
  const menu = [
    {
      id: "reply-horarios",
      triggers: ["horario"],
      answer: "Abrimos de 9 a 6.",
      buttons: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      status: "OPEN",
      storeId: "store-1",
    });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageCreate.mockResolvedValue({});
    mocks.sendableReply.mockResolvedValue(null);
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
    mocks.typing.mockResolvedValue({ ok: true });
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
      "Abrimos de 9 a 6.",
      ESCAPE,
    );
  });

  it("despierta al bot aunque la conversación esté esperando a Paula", async () => {
    // Tocar un botón es la clienta eligiendo al bot a propósito.
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      status: "NEEDS_OWNER",
      storeId: "store-1",
    });

    await expect(
      runWhatsAppBot({
        ...input,
        interactiveReplyId: "r:reply-horarios",
        keywords: menu,
      }),
    ).resolves.toMatchObject({ outcome: "replied" });
  });

  it("un mensaje escrito NO la despierta", async () => {
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      status: "NEEDS_OWNER",
      storeId: "store-1",
    });

    await expect(runWhatsAppBot({ ...input, keywords: menu })).resolves.toEqual(
      {
        outcome: "skipped_needs_owner",
      },
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("llama a Paula si el botón apunta a algo borrado, apagado o sin aprobar", async () => {
    await expect(
      runWhatsAppBot({
        ...input,
        interactiveReplyId: "r:ya-no-existe",
        keywords: menu,
      }),
    ).resolves.toEqual({ outcome: "escalated_button_unavailable" });

    expect(mocks.send.mock.calls[0][1]).toBe(
      UNAVAILABLE_OPTION_ACKNOWLEDGEMENT,
    );
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
      runWhatsAppBot({
        ...withoutKeywords,
        interactiveReplyId: "r:reply-envios",
      }),
    ).resolves.toMatchObject({ outcome: "replied" });

    expect(mocks.sendableReply).toHaveBeenCalledWith("store-1", "reply-envios");
    expect(mocks.send).toHaveBeenCalledWith(
      "573001234567",
      "Enviamos a todo el país.",
      [{ id: "r:reply-catalogo", title: "Ver catálogo" }, ...ESCAPE],
    );
  });
});

describe("ritmo humano", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.conversationFindUnique.mockResolvedValue({
      id: "conversation-1",
      status: "OPEN",
      storeId: "store-1",
    });
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.messageCreate.mockResolvedValue({});
    mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
    mocks.typing.mockResolvedValue({ ok: true });
  });

  it("espera más cuando la respuesta es más larga, pero nunca de más", () => {
    const corta = getHumanPauseMs("Sí");
    const larga = getHumanPauseMs("a".repeat(120));

    expect(corta).toBeGreaterThanOrEqual(HUMAN_PAUSE_READ_MS);
    expect(larga).toBeGreaterThan(corta);
    // El indicador de Meta dura 25 s; la pausa debe quedar muy por debajo.
    expect(getHumanPauseMs("a".repeat(10000))).toBe(HUMAN_PAUSE_MAX_MS);
    expect(HUMAN_PAUSE_MAX_MS).toBeLessThan(25000);
  });

  it("muestra «escribiendo…» sobre el mensaje entrante antes de contestar", async () => {
    await runWhatsAppBot({ ...input, inboundMessageId: "wamid.ENTRA" });

    expect(mocks.typing).toHaveBeenCalledWith("wamid.ENTRA");
    expect(mocks.send).toHaveBeenCalled();
  });

  it("contesta igual si el indicador falla: es adorno, no requisito", async () => {
    mocks.typing.mockResolvedValue({ ok: false, error: "not configured" });

    await expect(
      runWhatsAppBot({ ...input, inboundMessageId: "wamid.ENTRA" }),
    ).resolves.toMatchObject({ outcome: "replied" });
    expect(mocks.send).toHaveBeenCalled();
  });

  it("no intenta el indicador cuando no hay mensaje al que engancharlo", async () => {
    await runWhatsAppBot({ ...input, inboundMessageId: null });

    expect(mocks.typing).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalled();
  });
});
