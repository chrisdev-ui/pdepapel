import { MinimumOrderRule } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  send: vi.fn(),
  typing: vi.fn(),
  activeKeywords: vi.fn(),
  sendableReply: vi.fn(),
  answerProduct: vi.fn(),
  answerAboutProduct: vi.fn(),
  resolveReference: vi.fn(),
  sendImage: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
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
vi.mock("@/lib/whatsapp/bot-products", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/bot-products")>()),
  answerProductQuestion: mocks.answerProduct,
  answerAboutProduct: mocks.answerAboutProduct,
}));
// `detectProductReference` se deja real: es puro y es justo lo que decide si
// el mensaje entra en esta etapa.
vi.mock("@/lib/whatsapp/bot-references", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/bot-references")>()),
  resolveProductReference: mocks.resolveReference,
}));
vi.mock("@/lib/whatsapp/send", () => ({
  sendWhatsAppButtonMessage: mocks.send,
  sendWhatsAppImageButtonMessage: mocks.sendImage,
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
  OWNER_TAKEOVER_WINDOW_HOURS,
  TALK_TO_OWNER_ACKNOWLEDGEMENT,
  UNAVAILABLE_OPTION_ACKNOWLEDGEMENT,
  buildReplyButtons,
  formatBotReply,
  getHumanPauseMs,
  isOwnerActive,
  matchWhatsAppKeyword,
  normalizeBotText,
  runWhatsAppBot,
} from "@/lib/whatsapp/bot";
import type { ResolvedStoreSettings } from "@/lib/store-settings";
import { BUSINESS_FACT_TEMPLATES_VERSION } from "@/lib/whatsapp/bot-facts";
import {
  PRODUCT_TEMPLATES,
  PRODUCT_TEMPLATES_VERSION,
} from "@/lib/whatsapp/bot-products";
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

/** Una tienda con todo lleno y los datos del negocio ya aprobados. */
const ajustesBase: ResolvedStoreSettings = {
  alwaysOpen: false,
  openingHours: {
    lun: { abre: "08:00", cierra: "18:00" },
    mar: { abre: "08:00", cierra: "18:00" },
    mie: { abre: "08:00", cierra: "18:00" },
    jue: { abre: "08:00", cierra: "18:00" },
    vie: { abre: "08:00", cierra: "18:00" },
    sab: { abre: "08:00", cierra: "18:00" },
    dom: { abre: "08:00", cierra: "18:00" },
  },
  cityName: "Medellín",
  hasPhysicalStore: false,
  physicalAddress: null,
  minOrderRule: MinimumOrderRule.NONE,
  minOrderAmount: null,
  freeShippingThreshold: 120000,
  deliveryEstimate: "2 a 4 días hábiles",
  botEnabled: true,
  botFactsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
  botFactsVersion: BUSINESS_FACT_TEMPLATES_VERSION,
  botProductsApprovedAt: null,
  botProductsVersion: null,
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

  describe("mientras Paula esté encima de la conversación", () => {
    const AHORA = new Date("2026-09-15T02:30:00.000Z");
    /** Deja la conversación con el último mensaje de Paula hace `horas`. */
    const pauleóHace = (horas: number, status = "OPEN") =>
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status,
        storeId: "store-1",
        lastOwnerAt: new Date(AHORA.getTime() - horas * 60 * 60 * 1000),
      });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(AHORA);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("hace una hora: no le llega nada a la clienta, pero queda marcada", async () => {
      pauleóHace(1);

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "skipped_owner_active",
      });

      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.typing).not.toHaveBeenCalled();
      expect(mocks.messageCreate).not.toHaveBeenCalled();
      // Callarse hacia afuera no es no hacer nada: por dentro queda pendiente.
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });

    it("no vuelve a marcar lo que ya estaba marcado", async () => {
      pauleóHace(1, "NEEDS_OWNER");

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "skipped_owner_active",
      });
      expect(mocks.conversationUpdate).not.toHaveBeenCalled();
    });

    it("hace 23,9 horas: justo dentro, sigue callado", async () => {
      pauleóHace(23.9);

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "skipped_owner_active",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("hace 25 horas: el hilo se enfrió y el bot vuelve a atender", async () => {
      // Esta es LA diferencia con el parche del 2026-09-15, que aquí se
      // habría quedado callado para siempre.
      pauleóHace(25);

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "replied",
        trigger: "horario",
      });
      expect(mocks.send).toHaveBeenCalledWith(
        "573001234567",
        "Abrimos de 9 a 6.",
        ESCAPE,
      );
    });

    it("justo en las 24 horas ya se considera frío", async () => {
      pauleóHace(24);

      await expect(runWhatsAppBot(input)).resolves.toMatchObject({
        outcome: "replied",
      });
    });

    it("calla incluso si la clienta toca «Hablar con Paula»", async () => {
      // Avisarle de algo que ya está leyendo no aporta nada.
      pauleóHace(1);

      await expect(
        runWhatsAppBot({ ...input, interactiveReplyId: TALK_TO_OWNER_BUTTON_ID }),
      ).resolves.toEqual({ outcome: "skipped_owner_active" });

      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("el caso Chuchu, con las horas reales de producción", async () => {
      // El hilo de la proveedora: ella contestó a las 02:25:28 y el bot se
      // metió cinco veces entre sus mensajes. Con la ventana, los mensajes
      // que llegan justo después ya no lo despiertan.
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-chuchu",
        status: "OPEN",
        storeId: "store-1",
        lastOwnerAt: new Date("2026-09-15T02:25:28.000Z"),
      });

      const entrantes = [
        "Si supera los 0,5 metros cúbicos, ya no puede considerarse una muestra.",
        "Si tu primo lo necesita, quizá la próxima vez podamos incluir…",
        "¡Tu esposo es increíble!",
      ];
      for (const body of entrantes) {
        await expect(
          runWhatsAppBot({ ...input, conversationId: "conversation-chuchu", body }),
        ).resolves.toEqual({ outcome: "skipped_owner_active" });
      }
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("sin nada de Paula nunca, todo sigue como antes", async () => {
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "OPEN",
        storeId: "store-1",
        lastOwnerAt: null,
      });

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "replied",
        trigger: "horario",
      });

      vi.clearAllMocks();
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "OPEN",
        storeId: "store-1",
        lastOwnerAt: null,
      });
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


  describe("datos del negocio", () => {
    const aprobados: ResolvedStoreSettings = ajustesBase;
    const preguntar = (body: string, settings = aprobados) =>
      runWhatsAppBot({ ...input, body, settings });

    it("contesta el horario con el dato guardado", async () => {
      await expect(preguntar("¿cuál es el horario?")).resolves.toEqual({
        outcome: "replied_business_fact",
        trigger: "business.hours",
      });
      expect(mocks.send.mock.calls[0][1]).toContain("08:00 - 18:00");
      // Sale con la salida de siempre, como cualquier mensaje del bot.
      expect(mocks.send.mock.calls[0][2]).toEqual(ESCAPE);
    });

    it("contesta las otras cinco", async () => {
      const casos: [string, string][] = [
        ["¿en qué ciudad están?", "Medellín"],
        ["tienen tienda fisica?", "solo vendemos en línea"],
        ["hay pedido minimo?", "No hay pedido mínimo"],
        ["desde cuanto es gratis el envio?", "$120.000"],
        ["cuanto se demora en llegar?", "2 a 4 días hábiles"],
      ];
      for (const [pregunta, esperado] of casos) {
        vi.clearAllMocks();
        mocks.conversationFindUnique.mockResolvedValue({
          id: "conversation-1",
          status: "OPEN",
          storeId: "store-1",
          lastOwnerAt: null,
        });
        mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.BOT1" });
        mocks.typing.mockResolvedValue({ ok: true });
        const res = await preguntar(pregunta);
        expect(res.outcome).toBe("replied_business_fact");
        expect(mocks.send.mock.calls[0][1]).toContain(esperado);
      }
    });

    it("sin el dato guardado NO inventa: cae al camino de siempre y escala", async () => {
      // La ciudad está vacía, que es como está hoy la tienda de verdad.
      await expect(
        preguntar("¿en qué ciudad están?", { ...aprobados, cityName: null }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });

      expect(mocks.send).toHaveBeenCalledOnce();
      expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });

    it("sin el visto bueno de Paula no sale, pero tampoco calla", async () => {
      // Se pregunta por la ciudad, que no tiene palabra clave configurada, para
      // ver el final del camino sin que lo tape el emparejador.
      await expect(
        preguntar("¿en qué ciudad están?", {
          ...aprobados,
          botFactsApprovedAt: null,
        }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
      expect(mocks.send.mock.calls[0][1]).not.toContain("Medellín");
    });

    it("si se edita un texto, la aprobación vieja ya no vale", async () => {
      await expect(
        preguntar("¿en qué ciudad están?", {
          ...aprobados,
          botFactsVersion: "version-vieja",
        }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.send.mock.calls[0][1]).not.toContain("Medellín");
    });

    it("lo que no es un dato del negocio sigue con las palabras clave de hoy", async () => {
      await expect(
        runWhatsAppBot({ ...input, body: "necesito un ENVÍO", settings: aprobados }),
      ).resolves.toEqual({ outcome: "replied", trigger: "envio" });
      expect(mocks.send.mock.calls[0][1]).toBe("Enviamos a todo el país.");
    });

    it("sin aprobar, una palabra clave configurada sigue contestando", async () => {
      // El camino completo: no hay visto bueno, así que el paso nuevo se salta
      // y contesta la respuesta que Paula ya tenía guardada para «horario».
      await expect(
        preguntar("¿Cuál es el horario?", {
          ...aprobados,
          botFactsApprovedAt: null,
        }),
      ).resolves.toEqual({ outcome: "replied", trigger: "horario" });
      expect(mocks.send.mock.calls[0][1]).toBe("Abrimos de 9 a 6.");
    });

    it("aprobado, el dato guardado gana a la palabra clave", async () => {
      // Con visto bueno, «horario» lo contesta el dato real y no el texto de
      // ejemplo: el paso nuevo va antes que el emparejador.
      await expect(preguntar("¿Cuál es el horario?")).resolves.toEqual({
        outcome: "replied_business_fact",
        trigger: "business.hours",
      });
      expect(mocks.send.mock.calls[0][1]).toContain("08:00 - 18:00");
    });

    it("Paula en la conversación manda por encima de todo esto", async () => {
      // Aunque la pregunta tenga respuesta y esté aprobada, si ella está en el
      // hilo no le llega nada a la clienta.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T02:30:00.000Z"));
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "OPEN",
        storeId: "store-1",
        lastOwnerAt: new Date("2026-09-15T01:30:00.000Z"),
      });

      await expect(preguntar("¿cuál es el horario?")).resolves.toEqual({
        outcome: "skipped_owner_active",
      });
      expect(mocks.send).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("preguntas por productos", () => {
    const aprobado: ResolvedStoreSettings = {
      ...ajustesBase,
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };

    beforeEach(() => {
      mocks.answerProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí 💛 Tengo Cuaderno Stitch en $18.000. ¿Te lo aparto?",
        photo: null,
      });
      mocks.sendImage.mockResolvedValue({ ok: true, externalId: "wamid.IMG1" });
    });

    it("contesta con lo que encontró en el catálogo", async () => {
      await expect(
        runWhatsAppBot({
          ...input,
          body: "¿tienen cuadernos de Stitch?",
          settings: aprobado,
        }),
      ).resolves.toEqual({
        outcome: "replied_product",
        trigger: "product.search",
      });
      expect(mocks.send.mock.calls[0][1]).toContain("Cuaderno Stitch");
      expect(mocks.send.mock.calls[0][2]).toEqual(ESCAPE);
    });

    it("sin el visto bueno no contesta, pero tampoco calla", async () => {
      await expect(
        runWhatsAppBot({
          ...input,
          body: "¿tienen cuadernos de Stitch?",
          settings: { ...aprobado, botProductsApprovedAt: null },
        }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.answerProduct).not.toHaveBeenCalled();
      expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
    });

    it("si el modelo no pudo, sigue a las palabras clave de siempre", async () => {
      // Esto es lo que pasa con la cuota agotada: `answerProductQuestion`
      // devuelve null y el mensaje continúa como si este paso no existiera.
      mocks.answerProduct.mockResolvedValue(null);

      await expect(
        runWhatsAppBot({
          ...input,
          body: "¿tienen algo de envio?",
          settings: aprobado,
        }),
      ).resolves.toEqual({ outcome: "replied", trigger: "envio" });
      expect(mocks.send.mock.calls[0][1]).toBe("Enviamos a todo el país.");
    });

    it("si no pudo y tampoco hay palabra clave, queda para Paula", async () => {
      mocks.answerProduct.mockResolvedValue(null);

      await expect(
        runWhatsAppBot({
          ...input,
          body: "¿tienen algo de Kuromi?",
          settings: aprobado,
        }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });

    it("los datos del negocio siguen ganando: se resuelven antes", async () => {
      // «horario» es dato del negocio (paso 4) y no debe llegar al paso 5.
      await expect(
        runWhatsAppBot({
          ...input,
          body: "¿cuál es el horario?",
          settings: aprobado,
        }),
      ).resolves.toEqual({
        outcome: "replied_business_fact",
        trigger: "business.hours",
      });
      expect(mocks.answerProduct).not.toHaveBeenCalled();
    });

    it("Paula en la conversación manda por encima de esto también", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T02:30:00.000Z"));
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "OPEN",
        storeId: "store-1",
        lastOwnerAt: new Date("2026-09-15T01:30:00.000Z"),
      });

      await expect(
        runWhatsAppBot({
          ...input,
          body: "¿tienen cuadernos de Stitch?",
          settings: aprobado,
        }),
      ).resolves.toEqual({ outcome: "skipped_owner_active" });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.answerProduct).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("fotos de producto", () => {
    const FOTO = "https://res.cloudinary.com/x/image/upload/f_auto,q_auto,c_limit,w_1600/v1/a.jpg";
    const conFoto = (photo: string | null) =>
      mocks.answerProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí 💛 Tengo Cuaderno Stitch en $18.000. ¿Te lo aparto?",
        photo,
      });

    const aprobado: ResolvedStoreSettings = {
      ...ajustesBase,
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };
    const preguntar = () =>
      runWhatsAppBot({
        ...input,
        body: "¿tienen cuadernos de Stitch?",
        settings: aprobado,
      });

    it("con foto sale por el envío con imagen, y el botón sigue ahí", async () => {
      conFoto(FOTO);
      await expect(preguntar()).resolves.toEqual({
        outcome: "replied_product",
        trigger: "product.search",
      });
      expect(mocks.sendImage).toHaveBeenCalledOnce();
      expect(mocks.send).not.toHaveBeenCalled();
      const [, texto, botones, foto] = mocks.sendImage.mock.calls[0];
      expect(texto).toContain("Cuaderno Stitch");
      expect(botones).toEqual(ESCAPE);
      expect(foto).toBe(FOTO);
      // Queda anotado como foto en el panel.
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ mediaType: "image", mediaUrl: FOTO }),
      });
    });

    it("sin foto sale por el envío normal, sin intentar imagen", async () => {
      conFoto(null);
      await expect(preguntar()).resolves.toMatchObject({ outcome: "replied_product" });
      expect(mocks.sendImage).not.toHaveBeenCalled();
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(mocks.messageCreate.mock.calls[0][0].data.mediaUrl).toBeUndefined();
    });

    it("SI META RECHAZA LA FOTO: se manda el mismo texto sin ella", async () => {
      conFoto(FOTO);
      // El rechazo real de Meta cuando la URL no le sirve.
      mocks.sendImage.mockResolvedValue({
        ok: false,
        error: "(#131053) Media upload error",
      });
      mocks.send.mockResolvedValue({ ok: true, externalId: "wamid.TEXTO" });

      await expect(preguntar()).resolves.toEqual({
        outcome: "replied_product",
        trigger: "product.search",
      });

      expect(mocks.sendImage).toHaveBeenCalledOnce();
      // El respaldo: mismo texto, mismos botones, sin foto.
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(mocks.send.mock.calls[0][1]).toBe(mocks.sendImage.mock.calls[0][1]);
      expect(mocks.send.mock.calls[0][2]).toEqual(ESCAPE);
      // Y en el panel NO se apunta una foto que nunca salió.
      expect(mocks.messageCreate.mock.calls[0][0].data.mediaUrl).toBeUndefined();
    });

    it("si también falla el texto, queda como fallido y escala", async () => {
      conFoto(FOTO);
      mocks.sendImage.mockResolvedValue({ ok: false, error: "media error" });
      mocks.send.mockResolvedValue({ ok: false, error: "caído" });

      await expect(preguntar()).resolves.toMatchObject({
        outcome: "escalated_send_failed",
      });
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });

    it("Paula en la conversación manda por encima de la foto también", async () => {
      conFoto(FOTO);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T02:30:00.000Z"));
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "OPEN",
        storeId: "store-1",
        lastOwnerAt: new Date("2026-09-15T01:30:00.000Z"),
      });

      await expect(preguntar()).resolves.toEqual({ outcome: "skipped_owner_active" });
      expect(mocks.sendImage).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("isOwnerActive", () => {
    const ahora = new Date("2026-09-15T02:30:00.000Z");
    const hace = (horas: number) =>
      new Date(ahora.getTime() - horas * 60 * 60 * 1000);

    it("sin fecha no hay nadie llevando el hilo", () => {
      expect(isOwnerActive(null, ahora)).toBe(false);
      expect(isOwnerActive(undefined, ahora)).toBe(false);
    });

    it("la ventana se cierra justo a las 24 horas", () => {
      expect(isOwnerActive(hace(23.99), ahora)).toBe(true);
      expect(isOwnerActive(hace(24), ahora)).toBe(false);
      expect(isOwnerActive(hace(24.01), ahora)).toBe(false);
      expect(OWNER_TAKEOVER_WINDOW_HOURS).toBe(24);
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

  describe("«el primero», «ese»", () => {
    const aprobado: ResolvedStoreSettings = {
      ...ajustesBase,
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };
    const señalar = (body: string) =>
      runWhatsAppBot({ ...input, body, settings: aprobado });

    beforeEach(() => {
      mocks.resolveReference.mockResolvedValue({ outcome: "none" });
      mocks.answerProduct.mockResolvedValue(null);
      mocks.sendImage.mockResolvedValue({ ok: true, externalId: "wamid.IMG1" });
    });

    it("contesta del producto que señaló", async () => {
      mocks.resolveReference.mockResolvedValue({
        outcome: "resolved",
        productId: "p2",
        intent: "product.price",
      });
      mocks.answerAboutProduct.mockResolvedValue({
        intent: "product.price",
        text: "Cuaderno Stitch está en $18.000 💛 ¿Te lo aparto?",
        photo: null,
        shownIds: ["p2"],
      });

      await expect(señalar("el segundo")).resolves.toEqual({
        outcome: "replied_product_reference",
        trigger: "product.price",
      });
      expect(mocks.answerAboutProduct).toHaveBeenCalledWith(
        "store-1",
        "p2",
        "product.price",
      );
      expect(mocks.send.mock.calls[0][1]).toContain("Cuaderno Stitch");
    });

    it("no gasta una llamada al modelo: ni llega al paso de productos", async () => {
      mocks.resolveReference.mockResolvedValue({
        outcome: "resolved",
        productId: "p1",
        intent: "product.search",
      });
      mocks.answerAboutProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí 💛 Tengo Cuaderno Stitch en $18.000. ¿Te lo aparto?",
        photo: null,
        shownIds: ["p1"],
      });

      await señalar("quiero el primero");
      expect(mocks.answerProduct).not.toHaveBeenCalled();
    });

    it("pide que lo repita cuando la lista ya no vale, sin pasarlo a Paula", async () => {
      mocks.resolveReference.mockResolvedValue({ outcome: "lost" });

      await expect(señalar("el primero")).resolves.toEqual({
        outcome: "replied_reference_lost",
      });
      expect(mocks.send.mock.calls[0][1]).toBe(PRODUCT_TEMPLATES["reference.lost"]());
      // No se marca para Paula: es una conversación de un mensaje más.
      expect(mocks.conversationUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "NEEDS_OWNER" } }),
      );
    });

    it("con «ese» y varios enseñados sigue su camino sin tocar nada", async () => {
      mocks.resolveReference.mockResolvedValue({ outcome: "none" });

      await expect(señalar("ese")).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.answerAboutProduct).not.toHaveBeenCalled();
      expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
    });

    it("sigue su camino si del producto no se pudo contar nada", async () => {
      mocks.resolveReference.mockResolvedValue({
        outcome: "resolved",
        productId: "p1",
        intent: "product.features",
      });
      mocks.answerAboutProduct.mockResolvedValue(null);

      await expect(señalar("el primero")).resolves.toEqual({
        outcome: "escalated_no_match",
      });
    });

    it("sin el visto bueno de Paula esta etapa no existe", async () => {
      await expect(
        runWhatsAppBot({
          ...input,
          body: "el primero",
          settings: { ...aprobado, botProductsApprovedAt: null },
        }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.resolveReference).not.toHaveBeenCalled();
    });

    it("un mensaje que no señala nada ni entra aquí", async () => {
      await runWhatsAppBot({
        ...input,
        body: "¿tienen cuadernos de Stitch?",
        settings: aprobado,
      });
      expect(mocks.resolveReference).not.toHaveBeenCalled();
    });

    it("no se cuela delante de un dato del negocio", async () => {
      // «primero» no aparece aquí, pero la etapa va DESPUÉS del paso 4 y esta
      // prueba lo fija: un horario se sigue contestando como siempre.
      await runWhatsAppBot({
        ...input,
        body: "¿a qué hora abren?",
        settings: aprobado,
      });
      expect(mocks.resolveReference).not.toHaveBeenCalled();
    });

    it("guarda lo que enseñó para poder resolverlo después", async () => {
      mocks.answerProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí, mira 💛 Tengo estos:\n• uno\n• dos\n¿Cuál te interesa?",
        photo: null,
        shownIds: ["p1", "p2"],
      });

      await runWhatsAppBot({
        ...input,
        body: "¿tienen cuadernos de Stitch?",
        settings: aprobado,
      });
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { shown: { ids: ["p1", "p2"], intent: "product.search" } },
        }),
      });
    });

    it("una respuesta sin productos no guarda nada", async () => {
      await runWhatsAppBot(input);
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: expect.not.objectContaining({ metadata: expect.anything() }),
      });
    });
  });
});
