import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Los frenos que el bot mira justo antes de cada envío. El detector de lo que
 * espera en la fila corre con el extractor real sobre cuerpos con la forma de
 * Meta: un texto, un toque, un eco de Paula y el mensaje de otra clienta.
 */
const mocks = vi.hoisted(() => ({
  events: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceWebhookEvent: { findMany: mocks.events },
    conversationMessage: { count: mocks.count, findMany: mocks.findMany },
    storeSettings: { findUnique: mocks.settings },
  },
}));

import {
  BOT_MAX_MESSAGES_PER_INBOUND,
  BOT_MAX_MESSAGES_PER_WINDOW,
  exceededBotCap,
  findPendingCustomerActivity,
  isBotEnabled,
  welcomeSentRecently,
} from "@/lib/whatsapp/bot-guards";

const CUSTOMER = "573001234567";
const OTHER = "573009998877";

function metaPayload(field: string, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field, value: { messaging_product: "whatsapp", ...value } }] }],
  };
}
const textFrom = (from: string) =>
  metaPayload("messages", {
    metadata: { phone_number_id: "PHONE-1" },
    messages: [{ from, id: `wamid.${from}`, timestamp: "1789300000", type: "text", text: { body: "otra cosa" } }],
  });
const tapFrom = (from: string) =>
  metaPayload("messages", {
    metadata: { phone_number_id: "PHONE-1" },
    messages: [
      {
        from,
        id: "wamid.tap",
        timestamp: "1789300001",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "owner", title: "Hablar con Paula" } },
      },
    ],
  });
const echoTo = (to: string) =>
  metaPayload("smb_message_echoes", {
    message_echoes: [{ from: "573132582293", to, id: "wamid.echo", timestamp: "1789300002", type: "text", text: { body: "ya te escribo" } }],
  });

const query = {
  eventId: "event-1",
  eventCreatedAt: new Date("2026-10-10T14:08:30.000Z"),
  phone: CUSTOMER,
  bsuid: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events.mockResolvedValue([]);
});

describe("findPendingCustomerActivity", () => {
  it("busca solo eventos de WhatsApp sin procesar que llegaron después de este", async () => {
    await findPendingCustomerActivity(query);
    expect(mocks.events).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: "WHATSAPP",
          processedAt: null,
          createdAt: { gt: query.eventCreatedAt },
          id: { not: "event-1" },
        },
      }),
    );
  });

  it("un mensaje escrito de la misma clienta en la fila", async () => {
    mocks.events.mockResolvedValue([{ payload: textFrom(CUSTOMER) }]);
    await expect(findPendingCustomerActivity(query)).resolves.toBe("customer_message");
  });

  it("su toque de «Hablar con Paula» en la fila", async () => {
    mocks.events.mockResolvedValue([{ payload: tapFrom(CUSTOMER) }]);
    await expect(findPendingCustomerActivity(query)).resolves.toBe("customer_message");
  });

  it("un mensaje de Paula a esta clienta en la fila", async () => {
    mocks.events.mockResolvedValue([{ payload: echoTo(CUSTOMER) }]);
    await expect(findPendingCustomerActivity(query)).resolves.toBe("owner_message");
  });

  it("lo de otra clienta no frena a esta", async () => {
    mocks.events.mockResolvedValue([{ payload: textFrom(OTHER) }, { payload: echoTo(OTHER) }]);
    await expect(findPendingCustomerActivity(query)).resolves.toBeNull();
  });

  it("sin teléfono ni BSUID no consulta nada", async () => {
    await expect(findPendingCustomerActivity({ ...query, phone: null })).resolves.toBeNull();
    expect(mocks.events).not.toHaveBeenCalled();
  });
});

describe("exceededBotCap", () => {
  const llego = new Date("2026-10-10T15:00:00.000Z");

  it(`más de ${BOT_MAX_MESSAGES_PER_INBOUND} por mensaje de la clienta`, async () => {
    mocks.count.mockResolvedValueOnce(BOT_MAX_MESSAGES_PER_INBOUND);
    await expect(exceededBotCap("c-1", llego)).resolves.toBe("per_inbound");
  });

  it(`más de ${BOT_MAX_MESSAGES_PER_WINDOW} en 10 minutos`, async () => {
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(BOT_MAX_MESSAGES_PER_WINDOW);
    await expect(exceededBotCap("c-1", llego)).resolves.toBe("per_window");
  });

  it("por debajo de los dos topes", async () => {
    mocks.count.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    await expect(exceededBotCap("c-1", llego)).resolves.toBeNull();
    const ventana = mocks.count.mock.calls[1][0].where.createdAt.gte as Date;
    expect(Date.now() - ventana.getTime()).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
  });
});

describe("welcomeSentRecently", () => {
  const cuerpo = "¡Hola! 💛 Qué gusto que escribas a P de Papel. Cuéntame qué buscas";

  it("reconoce el menú marcado y el de antes por cómo empieza", async () => {
    mocks.findMany.mockResolvedValueOnce([{ body: "otra cosa", metadata: { kind: "welcome" } }]);
    await expect(welcomeSentRecently("c-1", cuerpo)).resolves.toBe(true);
    mocks.findMany.mockResolvedValueOnce([{ body: `${cuerpo}\n• Medios de pago`, metadata: null }]);
    await expect(welcomeSentRecently("c-1", cuerpo)).resolves.toBe(true);
    mocks.findMany.mockResolvedValueOnce([{ body: "Abrimos de 9 a 6.", metadata: null }]);
    await expect(welcomeSentRecently("c-1", cuerpo)).resolves.toBe(false);
  });
});

describe("isBotEnabled", () => {
  it("lee el interruptor en cada llamada; sin fila, apagado", async () => {
    mocks.settings.mockResolvedValueOnce({ botEnabled: true }).mockResolvedValueOnce({ botEnabled: false }).mockResolvedValueOnce(null);
    await expect(isBotEnabled("store-1")).resolves.toBe(true);
    await expect(isBotEnabled("store-1")).resolves.toBe(false);
    await expect(isBotEnabled("store-1")).resolves.toBe(false);
    expect(mocks.settings).toHaveBeenCalledTimes(3);
  });
});
