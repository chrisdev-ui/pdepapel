import { MinimumOrderRule } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationFindUnique: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  messageFindMany: vi.fn(),
  productFindFirst: vi.fn(),
  send: vi.fn(),
  typing: vi.fn(),
  activeKeywords: vi.fn(),
  sendableReply: vi.fn(),
  answerProduct: vi.fn(),
  answerAboutProduct: vi.fn(),
  resolveReference: vi.fn(),
  shownIntent: vi.fn(),
  sendImage: vi.fn(),
  sendList: vi.fn(),
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
      findMany: mocks.messageFindMany,
    },
    product: { findFirst: mocks.productFindFirst },
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
  readShownIntentForProduct: mocks.shownIntent,
}));
vi.mock("@/lib/whatsapp/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/send")>()),
  sendWhatsAppButtonMessage: mocks.send,
  sendWhatsAppImageButtonMessage: mocks.sendImage,
  sendWhatsAppListMessage: mocks.sendList,
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
  SLOW_ANSWER_ACKNOWLEDGEMENT,
  UNREADABLE_MEDIA_ACKNOWLEDGEMENT,
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
  paymentCashInfo: "Con gusto, trae el valor exacto si puedes.",
  paymentBancolombiaAccount: "Cuenta de Ahorros #00000000000",
  paymentNequiNumber: "3000000000",
  paymentDaviplataNumber: "3000000001",
  paymentCardInfo: "Recibimos todas las tarjetas.",
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
    // Desde que se puede nombrar el producto, casi cualquier mensaje corto
    // entra en la etapa de referencias. Que por defecto no resuelva nada es lo
    // que hace en la vida real cuando no hay lista delante.
    mocks.resolveReference.mockResolvedValue({ outcome: "none" });
    mocks.shownIntent.mockResolvedValue("product.search");
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

  describe("no contestar de más ni repetirse", () => {
    const LLEGO = new Date("2026-09-15T23:53:30.000Z");

    // Este bloque juega con el último mensaje del bot; se deja como estaba
    // para que no se le cuele a los de al lado.
    beforeEach(() => mocks.messageFindFirst.mockResolvedValue(null));
    afterEach(() => mocks.messageFindFirst.mockResolvedValue(null));

    it("si ya llegó otro mensaje después, contesta ese y no este", async () => {
      // La ráfaga real del 2026-09-15: «Holaa», «Buenas noches» y la pregunta
      // de verdad en 23 segundos. Antes salían dos saludos iguales seguidos.
      mocks.messageFindFirst.mockResolvedValue({ id: "wamid.mas-nuevo" });

      await expect(
        runWhatsAppBot({ ...input, body: "Holaa", inboundAt: LLEGO }),
      ).resolves.toEqual({ outcome: "skipped_superseded" });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("el último de la ráfaga sí se contesta", async () => {
      mocks.messageFindFirst.mockResolvedValue(null);

      await expect(
        runWhatsAppBot({ ...input, inboundAt: LLEGO }),
      ).resolves.toMatchObject({ outcome: "replied" });
    });

    it("un toque de botón nunca se salta: es una elección suya", async () => {
      mocks.messageFindFirst.mockResolvedValue({ id: "wamid.mas-nuevo" });

      await expect(
        runWhatsAppBot({
          ...input,
          body: "Hablar con Paula",
          interactiveReplyId: TALK_TO_OWNER_BUTTON_ID,
          inboundAt: LLEGO,
        }),
      ).resolves.toEqual({ outcome: "escalated_owner_requested" });
    });

    it("sin fecha del mensaje no se salta nada", async () => {
      mocks.messageFindFirst.mockResolvedValue({ id: "wamid.mas-nuevo" });
      await expect(runWhatsAppBot(input)).resolves.toMatchObject({
        outcome: "replied",
      });
    });

    it("no manda dos veces seguidas el mismo texto", async () => {
      // `justSaid` mira el último mensaje del bot; si es idéntico, no repite.
      mocks.messageFindFirst.mockResolvedValue({ body: "Abrimos de 9 a 6." });

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "replied",
        trigger: "horario",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    });
  });

  describe("lo que escribió Paula gana a lo que adivina el catálogo", () => {
    const aprobado: ResolvedStoreSettings = {
      ...ajustesBase,
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };

    beforeEach(() => {
      mocks.resolveReference.mockResolvedValue({ outcome: "none" });
      mocks.answerProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí 💛 Tengo 4 que te pueden servir…",
        photo: null,
        shownIds: ["p1"],
      });
    });

    it("una palabra clave suya se contesta sin pasar por el catálogo", async () => {
      // «tienes» haría que esto entrara al buscador; la respuesta de Paula
      // para «envio» va primero.
      await expect(
        runWhatsAppBot({
          ...input,
          body: "tienes envio a mi ciudad?",
          settings: aprobado,
        }),
      ).resolves.toEqual({ outcome: "replied", trigger: "envio" });
      expect(mocks.answerProduct).not.toHaveBeenCalled();
      expect(mocks.send.mock.calls[0][1]).toBe("Enviamos a todo el país.");
    });

    it("sin palabra clave suya, sigue buscando en el catálogo", async () => {
      await expect(
        runWhatsAppBot({
          ...input,
          body: "tienes cuadernos de Stitch?",
          settings: aprobado,
        }),
      ).resolves.toMatchObject({ outcome: "replied_product" });
      expect(mocks.answerProduct).toHaveBeenCalled();
    });
  });

  describe("después de devolverle la conversación al bot", () => {
    const AYER = new Date("2026-09-15T20:00:00.000Z");

    it("con Paula dentro, el bot calla", async () => {
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "NEEDS_OWNER",
        storeId: "store-1",
        lastOwnerAt: new Date(),
      });

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "skipped_owner_active",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("con la parada quitada, vuelve a contestar el mensaje siguiente", async () => {
      // Justo lo que deja escrito «Devolver al bot»: abierta y sin dueña.
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
      expect(mocks.send.mock.calls[0][1]).toBe("Abrimos de 9 a 6.");
    });

    it("lee el estado FRESCO en cada mensaje, no uno leído antes", async () => {
      // Si la devolución entra a mitad de una tanda de mensajes, el siguiente
      // ya la ve: cada llamada vuelve a consultar la conversación.
      mocks.conversationFindUnique
        .mockResolvedValueOnce({
          id: "conversation-1", status: "NEEDS_OWNER", storeId: "store-1",
          lastOwnerAt: AYER,
        })
        .mockResolvedValueOnce({
          id: "conversation-1", status: "OPEN", storeId: "store-1",
          lastOwnerAt: null,
        });

      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "skipped_owner_active",
      });
      await expect(runWhatsAppBot(input)).resolves.toEqual({
        outcome: "replied",
        trigger: "horario",
      });
      expect(mocks.conversationFindUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe("una foto sin una sola palabra", () => {
    const soloFoto = { ...input, body: "", mediaForOwner: true };

    it("ya no se queda callado: acusa recibo y se lo pasa a Paula", async () => {
      await expect(runWhatsAppBot(soloFoto)).resolves.toEqual({
        outcome: "escalated_unprocessable_media",
      });
      expect(mocks.send.mock.calls[0][1]).toBe(UNREADABLE_MEDIA_ACKNOWLEDGEMENT);
      expect(mocks.send.mock.calls[0][2]).toEqual(ESCAPE);
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });

    it("no dice «esa no me la sé»: no preguntó nada con palabras", async () => {
      await runWhatsAppBot(soloFoto);
      expect(mocks.send.mock.calls[0][1]).not.toBe(NO_MATCH_ACKNOWLEDGEMENT);
    });

    it("no habla de «foto»: por aquí pasan audios y documentos", async () => {
      expect(UNREADABLE_MEDIA_ACKNOWLEDGEMENT).not.toContain("foto");
    });

    it("si la conversación YA esperaba a Paula, se queda callado", async () => {
      // Lo importante del sitio donde va la rama: detrás del portón del paso 2,
      // para que una foto detrás de un mensaje ya escalado no mande un segundo
      // acuse encima del primero.
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "NEEDS_OWNER",
        storeId: "store-1",
      });

      await expect(runWhatsAppBot(soloFoto)).resolves.toEqual({
        outcome: "skipped_needs_owner",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("tampoco contesta si Paula está escribiendo ahora mismo", async () => {
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "OPEN",
        storeId: "store-1",
        lastOwnerAt: new Date(),
      });

      await expect(runWhatsAppBot(soloFoto)).resolves.toEqual({
        outcome: "skipped_owner_active",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("CON pie de foto tampoco se intenta: lo que importa está en la imagen", async () => {
      // El 2026-09-15 una clienta mandó la foto de una lista del colegio y se
      // le contestó con ocho productos sacados de la palabra «útiles». Ahora
      // ni con texto al lado se adivina.
      await expect(
        runWhatsAppBot({
          ...input,
          body: "me están pidiendo estos útiles",
          mediaForOwner: true,
        }),
      ).resolves.toEqual({ outcome: "escalated_unprocessable_media" });
      expect(mocks.send.mock.calls[0][1]).toBe(UNREADABLE_MEDIA_ACKNOWLEDGEMENT);
    });

    it("un audio va por el mismo camino que una foto", async () => {
      await expect(
        runWhatsAppBot({ ...input, body: "", mediaForOwner: true }),
      ).resolves.toEqual({ outcome: "escalated_unprocessable_media" });
    });

    it("si el acuse no sale, queda igualmente marcada para Paula", async () => {
      mocks.send.mockResolvedValue({ ok: false, error: "Meta dijo que no" });

      await expect(runWhatsAppBot(soloFoto)).resolves.toMatchObject({
        outcome: "escalated_unprocessable_media",
        error: "Meta dijo que no",
      });
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });
  });

  describe("el menú de formas de pago", () => {
    const aprobado: ResolvedStoreSettings = ajustesBase;

    beforeEach(() => {
      mocks.resolveReference.mockResolvedValue({ outcome: "none" });
      mocks.sendList.mockResolvedValue({ ok: true, externalId: "wamid.LIST1" });
      mocks.sendImage.mockResolvedValue({ ok: true, externalId: "wamid.IMG1" });
    });

    const preguntar = () =>
      runWhatsAppBot({ ...input, body: "¿cómo puedo pagar?", settings: aprobado });
    const tocar = (id: string, settings = aprobado) =>
      runWhatsAppBot({ ...input, body: "Efectivo", interactiveReplyId: id, settings });

    it("manda un menú tocable, no un muro con todas las cuentas", async () => {
      await expect(preguntar()).resolves.toEqual({
        outcome: "replied_business_fact",
        trigger: "payment.methods",
      });
      expect(mocks.sendList).toHaveBeenCalledOnce();
      const filas = mocks.sendList.mock.calls[0][2].rows;
      expect(filas.map((f: { title: string }) => f.title)).toEqual([
        "Efectivo", "Transferencia", "Datáfono", TALK_TO_OWNER_BUTTON_TITLE,
      ]);
    });

    it("ninguna cuenta viaja en el primer mensaje", async () => {
      await preguntar();
      expect(JSON.stringify(mocks.sendList.mock.calls[0])).not.toContain("00000000000");
    });

    it("tocar «Efectivo» contesta solo lo del efectivo", async () => {
      await expect(tocar("pay:efectivo")).resolves.toEqual({
        outcome: "replied_business_fact",
        trigger: "payment.efectivo",
      });
      expect(mocks.send.mock.calls[0][1]).toContain("valor exacto");
      expect(mocks.send.mock.calls[0][1]).not.toContain("00000000000");
      expect(mocks.send.mock.calls[0][2]).toEqual(ESCAPE);
    });

    it("tocar «Transferencia» abre el segundo menú, con la salida a Paula", async () => {
      await tocar("pay:transferencia");
      const filas = mocks.sendList.mock.calls[0][2].rows;
      expect(filas.map((f: { title: string }) => f.title)).toEqual([
        "Bancolombia", "Daviplata", "Nequi", TALK_TO_OWNER_BUTTON_TITLE,
      ]);
    });

    it("tocar «Bancolombia» manda la cuenta CON el QR", async () => {
      await expect(tocar("pay:bancolombia")).resolves.toMatchObject({
        outcome: "replied_business_fact",
      });
      expect(mocks.sendImage).toHaveBeenCalledOnce();
      const [, texto, botones, foto] = mocks.sendImage.mock.calls[0];
      expect(foto).toContain("qr-bre-b.jpeg");
      expect(texto).toContain("#00000000000");
      expect(texto).toContain("comprobante");
      expect(botones).toEqual(ESCAPE);
    });

    it("Nequi va sin foto", async () => {
      await tocar("pay:nequi");
      expect(mocks.sendImage).not.toHaveBeenCalled();
      expect(mocks.send.mock.calls[0][1]).toContain("3000000000");
    });

    it("una opción vaciada entre el menú y el toque pasa a Paula", async () => {
      await expect(
        tocar("pay:nequi", { ...aprobado, paymentNequiNumber: null }),
      ).resolves.toEqual({ outcome: "escalated_button_unavailable" });
      expect(mocks.send.mock.calls[0][1]).toBe(UNAVAILABLE_OPTION_ACKNOWLEDGEMENT);
    });

    it("…y las demás opciones siguen contestando igual", async () => {
      await expect(
        tocar("pay:bancolombia", { ...aprobado, paymentNequiNumber: null }),
      ).resolves.toMatchObject({ outcome: "replied_business_fact" });
    });

    it("sin el visto bueno de Paula, un toque tampoco contesta", async () => {
      await expect(
        tocar("pay:efectivo", { ...aprobado, botFactsApprovedAt: null }),
      ).resolves.toEqual({ outcome: "escalated_button_unavailable" });
      expect(mocks.send.mock.calls[0][1]).toBe(UNAVAILABLE_OPTION_ACKNOWLEDGEMENT);
    });

    it("una fila de pago no se confunde con una de producto", async () => {
      await tocar("pay:efectivo");
      expect(mocks.answerAboutProduct).not.toHaveBeenCalled();
    });

    it("la fila de Paula sigue llamando a Paula desde el menú de pagos", async () => {
      await expect(
        runWhatsAppBot({
          ...input,
          body: TALK_TO_OWNER_BUTTON_TITLE,
          interactiveReplyId: TALK_TO_OWNER_BUTTON_ID,
          settings: aprobado,
        }),
      ).resolves.toEqual({ outcome: "escalated_owner_requested" });
    });

    it("sin ninguna forma llena, la pregunta acaba en Paula como antes", async () => {
      await expect(
        runWhatsAppBot({
          ...input,
          body: "¿cómo puedo pagar?",
          settings: {
            ...aprobado,
            paymentCashInfo: null, paymentCardInfo: null,
            paymentBancolombiaAccount: null, paymentNequiNumber: null,
            paymentDaviplataNumber: null,
          },
        }),
      ).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.sendList).not.toHaveBeenCalled();
      expect(mocks.send.mock.calls[0][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
    });
  });

  describe("el aviso de que va lento", () => {
    const aprobado: ResolvedStoreSettings = {
      ...ajustesBase,
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };

    /** Deja que el módulo de productos dispare el aviso cuando quiera. */
    const conAviso = (respuesta: unknown) =>
      mocks.answerProduct.mockImplementation(async (_store, _body, opciones) => {
        await opciones?.onSlow?.();
        return respuesta;
      });

    beforeEach(() => {
      mocks.resolveReference.mockResolvedValue({ outcome: "none" });
      mocks.sendImage.mockResolvedValue({ ok: true, externalId: "wamid.IMG1" });
    });

    const preguntar = () =>
      runWhatsAppBot({ ...input, body: "tienen lapiceros en gel?", settings: aprobado });

    it("sale el aviso y después la respuesta de verdad", async () => {
      conAviso({
        intent: "product.search",
        text: "Sí 💛 Tengo Lapicero gel en $5.500. ¿Te lo aparto?",
        photo: null,
        shownIds: ["p1"],
      });

      await expect(preguntar()).resolves.toMatchObject({ outcome: "replied_product" });
      expect(mocks.send).toHaveBeenCalledTimes(2);
      expect(mocks.send.mock.calls[0][1]).toBe(SLOW_ANSWER_ACKNOWLEDGEMENT);
      expect(mocks.send.mock.calls[1][1]).toContain("Lapicero gel");
    });

    it("el aviso NO se guarda como lista: «el primero» sigue mirando la buena", async () => {
      conAviso({
        intent: "product.search",
        text: "Mira 💛 …",
        photo: null,
        shownIds: ["p1", "p2"],
      });

      await preguntar();
      const guardados = mocks.messageCreate.mock.calls.map((c) => c[0].data);
      const aviso = guardados.find((d) => d.body === SLOW_ANSWER_ACKNOWLEDGEMENT);
      expect(aviso).toBeDefined();
      expect(aviso.metadata).toBeUndefined();
      // Y la respuesta de verdad sí la lleva.
      expect(guardados.find((d) => d.metadata)?.metadata).toEqual({
        shown: { ids: ["p1", "p2"], intent: "product.search" },
      });
    });

    it("el aviso sale con el botón de Paula, como todo mensaje del bot", async () => {
      conAviso(null);
      await preguntar();
      expect(mocks.send.mock.calls[0][2]).toEqual(ESCAPE);
    });

    it("si el aviso no sale, la respuesta llega igual", async () => {
      mocks.send.mockResolvedValueOnce({ ok: false, error: "Meta dijo que no" });
      conAviso({
        intent: "product.search",
        text: "Sí 💛 Tengo Lapicero gel en $5.500. ¿Te lo aparto?",
        photo: null,
        shownIds: ["p1"],
      });

      await expect(preguntar()).resolves.toMatchObject({ outcome: "replied_product" });
      expect(mocks.send.mock.calls[1][1]).toContain("Lapicero gel");
    });

    it("si el modelo se cae después del aviso, sigue a las palabras clave", async () => {
      conAviso(null);
      await expect(preguntar()).resolves.toEqual({ outcome: "escalated_no_match" });
      expect(mocks.send.mock.calls[0][1]).toBe(SLOW_ANSWER_ACKNOWLEDGEMENT);
      expect(mocks.send.mock.calls[1][1]).toBe(NO_MATCH_ACKNOWLEDGEMENT);
    });
  });

  describe("la lista tocable", () => {
    const aprobado: ResolvedStoreSettings = {
      ...ajustesBase,
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };
    const tresCarpetas = {
      intent: "product.search" as const,
      text: "Mira 💛\n• Carpeta plástica oficio verde pastel — $8.000\n…",
      photo: null,
      shownIds: ["p1", "p2", "p3"],
      list: {
        body: "Sí 💛 Tengo 3 que te pueden servir. Míralos y tócame el que quieras.",
        rows: [
          { id: "p:p1", title: "verde pastel", description: "Carpeta plástica oficio verde pastel — $8.000" },
          { id: "p:p2", title: "rosada", description: "Carpeta plástica oficio rosada — $8.000" },
          { id: "p:p3", title: "lila", description: "Carpeta plástica oficio lila — $8.000" },
        ],
      },
    };

    beforeEach(() => {
      mocks.resolveReference.mockResolvedValue({ outcome: "none" });
      mocks.shownIntent.mockResolvedValue("product.search");
      mocks.sendList.mockResolvedValue({ ok: true, externalId: "wamid.LIST1" });
      mocks.sendImage.mockResolvedValue({ ok: true, externalId: "wamid.IMG1" });
      mocks.answerProduct.mockResolvedValue(tresCarpetas);
    });

    const preguntar = () =>
      runWhatsAppBot({ ...input, body: "¿tienen carpetas?", settings: aprobado });

    it("con varios manda la lista, no el muro de texto", async () => {
      await expect(preguntar()).resolves.toEqual({
        outcome: "replied_product",
        trigger: "product.search",
      });
      expect(mocks.sendList).toHaveBeenCalledOnce();
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("la última fila es siempre la de Paula", async () => {
      await preguntar();
      const filas = mocks.sendList.mock.calls[0][2].rows;
      expect(filas).toHaveLength(4);
      expect(filas[filas.length - 1].id).toBe(TALK_TO_OWNER_BUTTON_ID);
    });

    it("nunca pasa de las diez filas que admite Meta", async () => {
      await preguntar();
      expect(mocks.sendList.mock.calls[0][2].rows.length).toBeLessThanOrEqual(10);
    });

    it("guarda lo que enseñó, igual que la lista escrita", async () => {
      await preguntar();
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { shown: { ids: ["p1", "p2", "p3"], intent: "product.search" } },
        }),
      });
    });

    it("en el panel se ve lo que se le ofreció, no solo la frase", async () => {
      await preguntar();
      const guardado = mocks.messageCreate.mock.calls[0][0].data.body as string;
      expect(guardado).toContain("Carpeta plástica oficio rosada — $8.000");
    });

    it("si Meta rechaza la lista, sale el texto de siempre con el botón", async () => {
      mocks.sendList.mockResolvedValue({ ok: false, error: "400 sections" });

      await expect(preguntar()).resolves.toMatchObject({ outcome: "replied_product" });
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(mocks.send.mock.calls[0][1]).toContain("Carpeta plástica oficio");
      expect(mocks.send.mock.calls[0][2]).toEqual(ESCAPE);
    });

    it("con UNO solo no hay lista: va la respuesta de siempre con su foto", async () => {
      mocks.answerProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí 💛 Tengo Cuaderno Stitch en $18.000. ¿Te lo aparto?",
        photo: "https://…/foto.jpg",
        shownIds: ["p1"],
      });

      await preguntar();
      expect(mocks.sendList).not.toHaveBeenCalled();
      expect(mocks.sendImage).toHaveBeenCalledOnce();
    });
  });

  describe("tocar una fila de la lista", () => {
    const aprobado: ResolvedStoreSettings = {
      ...ajustesBase,
      botProductsApprovedAt: new Date("2026-09-15T00:00:00.000Z"),
      botProductsVersion: PRODUCT_TEMPLATES_VERSION,
    };
    const tocar = (id: string, settings = aprobado) =>
      runWhatsAppBot({
        ...input,
        body: "rosada",
        interactiveReplyId: id,
        settings,
      });

    beforeEach(() => {
      mocks.resolveReference.mockResolvedValue({ outcome: "none" });
      mocks.shownIntent.mockResolvedValue("product.search");
      mocks.sendList.mockResolvedValue({ ok: true, externalId: "wamid.LIST1" });
      mocks.sendImage.mockResolvedValue({ ok: true, externalId: "wamid.IMG1" });
      mocks.answerAboutProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí 💛 Tengo Carpeta plástica oficio rosada en $8.000. ¿Te lo aparto?",
        photo: "https://…/rosada.jpg",
        shownIds: ["p2"],
      });
    });

    it("contesta del producto tocado, con su foto", async () => {
      await expect(tocar("p:p2")).resolves.toEqual({
        outcome: "replied_product_reference",
        trigger: "product.search",
      });
      expect(mocks.answerAboutProduct).toHaveBeenCalledWith("store-1", "p2", "product.search");
      expect(mocks.sendImage).toHaveBeenCalledOnce();
    });

    it("hereda la pregunta con la que se enseñó la lista", async () => {
      mocks.shownIntent.mockResolvedValue("product.features");
      await tocar("p:p2");
      expect(mocks.answerAboutProduct).toHaveBeenCalledWith("store-1", "p2", "product.features");
    });

    it("abre ventana nueva: después «ese» señala lo que tocó", async () => {
      await tocar("p:p2");
      expect(mocks.messageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { shown: { ids: ["p2"], intent: "product.search" } },
        }),
      });
    });

    it("ni pregunta al modelo ni pasa por la etapa de referencias", async () => {
      await tocar("p:p2");
      expect(mocks.answerProduct).not.toHaveBeenCalled();
      expect(mocks.resolveReference).not.toHaveBeenCalled();
    });

    it("un producto archivado no revienta ni calla: pasa a Paula", async () => {
      mocks.answerAboutProduct.mockResolvedValue(null);

      await expect(tocar("p:borrado")).resolves.toEqual({
        outcome: "escalated_button_unavailable",
      });
      expect(mocks.send.mock.calls[0][1]).toBe(UNAVAILABLE_OPTION_ACKNOWLEDGEMENT);
      expect(mocks.conversationUpdate).toHaveBeenCalledWith({
        where: { id: "conversation-1" },
        data: { status: "NEEDS_OWNER" },
      });
    });

    it("sin el visto bueno tampoco calla: pasa a Paula", async () => {
      await expect(
        tocar("p:p2", { ...aprobado, botProductsApprovedAt: null }),
      ).resolves.toEqual({ outcome: "escalated_button_unavailable" });
      expect(mocks.answerAboutProduct).not.toHaveBeenCalled();
      expect(mocks.send.mock.calls[0][1]).toBe(UNAVAILABLE_OPTION_ACKNOWLEDGEMENT);
    });

    it("despierta una conversación que ya esperaba a Paula: tocar es elegir", async () => {
      mocks.conversationFindUnique.mockResolvedValue({
        id: "conversation-1",
        status: "NEEDS_OWNER",
        storeId: "store-1",
      });

      await expect(tocar("p:p2")).resolves.toMatchObject({
        outcome: "replied_product_reference",
      });
    });

    // El eslabón que de verdad importa: lo que el toque GUARDA tiene que ser
    // legible por la etapa de referencias. Aquí no se copia la forma a mano,
    // se toma la fila tal y como quedó escrita y se le pasa al resolvedor real.
    it("después de tocar, «ese» y «el 1» señalan lo que tocó", async () => {
      await tocar("p:p2");
      const guardado = mocks.messageCreate.mock.calls[0][0].data.metadata;
      expect(guardado).toEqual({ shown: { ids: ["p2"], intent: "product.search" } });

      const referencias = await vi.importActual<
        typeof import("@/lib/whatsapp/bot-references")
      >("@/lib/whatsapp/bot-references");

      mocks.messageFindMany.mockResolvedValue([
        { metadata: guardado, createdAt: new Date() },
      ]);
      mocks.productFindFirst.mockResolvedValue({ id: "p2" });

      for (const texto of ["ese", "el 1", "el primero"]) {
        const senal = referencias.detectProductReference(texto);
        expect(senal).not.toBeNull();
        await expect(
          referencias.resolveProductReference({
            conversationId: "conversation-1",
            storeId: "store-1",
            reference: senal!,
          }),
        ).resolves.toEqual({
          outcome: "resolved",
          productId: "p2",
          intent: "product.search",
        });
      }
    });

    it("la fila de Paula sigue llamando a Paula, sin tocar nada nuevo", async () => {
      await expect(
        runWhatsAppBot({
          ...input,
          body: "Hablar con Paula",
          interactiveReplyId: TALK_TO_OWNER_BUTTON_ID,
          settings: aprobado,
        }),
      ).resolves.toEqual({ outcome: "escalated_owner_requested" });
      expect(mocks.answerAboutProduct).not.toHaveBeenCalled();
      expect(mocks.send.mock.calls[0][1]).toBe(TALK_TO_OWNER_ACKNOWLEDGEMENT);
    });
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

    it("una pregunta larga de verdad ni entra aquí", async () => {
      // Una frase con más de tres palabras con peso ya no es responder a una
      // lista: es una pregunta, y la contesta el clasificador.
      await runWhatsAppBot({
        ...input,
        body: "¿cuánto vale el cuaderno argollado de Stitch morado?",
        settings: aprobado,
      });
      expect(mocks.resolveReference).not.toHaveBeenCalled();
    });

    it("una pregunta corta sí entra, pero no encaja y sigue su camino", async () => {
      // «tienen cuadernos» son tres palabras y podrían nombrar algo de la
      // lista. Se mira, no encaja con nada, y el mensaje continúa igual que
      // antes: la etapa no se traga preguntas nuevas.
      mocks.answerProduct.mockResolvedValue({
        intent: "product.search",
        text: "Sí 💛 Tengo Cuaderno Stitch en $18.000. ¿Te lo aparto?",
        photo: null,
        shownIds: ["p1"],
      });

      await expect(
        runWhatsAppBot({ ...input, body: "tienen cuadernos", settings: aprobado }),
      ).resolves.toMatchObject({ outcome: "replied_product" });
      expect(mocks.resolveReference).toHaveBeenCalled();
      expect(mocks.answerProduct).toHaveBeenCalled();
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
