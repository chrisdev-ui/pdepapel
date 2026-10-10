import { beforeEach, describe, expect, it, vi } from "vitest";

/** «Sistemas» en Inicio: mensajes del bot por cada mensaje de clienta en 24 h. */
const mocks = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({ default: { conversationMessage: { count: mocks.count } } }));

import { measureWhatsAppBotRatio, WHATSAPP_BOT_RATIO_LIMIT } from "@/lib/job-runs";

const now = new Date("2026-10-10T19:00:00.000Z");
const counts = (inbound: number, bot: number) => mocks.count.mockResolvedValueOnce(inbound).mockResolvedValueOnce(bot);

beforeEach(() => mocks.count.mockReset());

describe("measureWhatsAppBotRatio", () => {
  it("cuenta las últimas 24 h de esta tienda: entrantes de clientas y salientes del bot", async () => {
    counts(100, 8);
    await measureWhatsAppBotRatio("store-1", now);
    const [inbound, bot] = mocks.count.mock.calls.map((call) => call[0].where);
    expect(inbound).toMatchObject({ conversation: { storeId: "store-1" }, direction: "INBOUND", sentBy: "CUSTOMER" });
    expect(bot).toMatchObject({ conversation: { storeId: "store-1" }, direction: "OUTBOUND", sentBy: "BOT" });
    expect(now.getTime() - (inbound.createdAt.gte as Date).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("en verde a 0,08, como antes del incidente", async () => {
    counts(100, 8);
    await expect(measureWhatsAppBotRatio("store-1", now)).resolves.toMatchObject({
      ok: true,
      attention: false,
      metric: true,
      detail: "0,08 · 8 del bot, 100 de clientas",
    });
  });

  it(`en rojo por encima de ${WHATSAPP_BOT_RATIO_LIMIT}, como el 2026-10-10`, async () => {
    counts(12, 13);
    await expect(measureWhatsAppBotRatio("store-1", now)).resolves.toMatchObject({
      ok: false,
      attention: true,
      detail: "1,08 · 13 del bot, 12 de clientas · más de 0,5",
    });
  });

  it("justo en el límite sigue en verde; sin mensajes de nadie, también", async () => {
    counts(10, 5);
    await expect(measureWhatsAppBotRatio("store-1", now)).resolves.toMatchObject({ attention: false });
    counts(0, 0);
    await expect(measureWhatsAppBotRatio("store-1", now)).resolves.toMatchObject({ attention: false });
  });

  it("mensajes del bot sin ninguno de clientas es rojo", async () => {
    counts(0, 2);
    await expect(measureWhatsAppBotRatio("store-1", now)).resolves.toMatchObject({
      attention: true,
      detail: "sin mensajes de clientas · 2 del bot, 0 de clientas · más de 0,5",
    });
  });
});

describe("measureCopilotSpend", () => {
  const store = (today: number, month: number) => ({
    get: async (key: string) => (key.length > "ai:copiloto:spend:2026-10".length ? today : month),
    incrbyfloat: async () => 0,
    expire: async () => 1,
  });

  it("enseña el gasto del día y del mes contra sus topes", async () => {
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend(store(0.12, 3.4), now)).resolves.toMatchObject({
      name: "copilot-spend",
      metric: true,
      attention: false,
      detail: "Hoy USD 0,12 de USD 1,00 · mes USD 3,40 de USD 15,00",
    });
  });

  it("avisa cuando «a fondo» se apagó y se pone en rojo al llegar a un tope", async () => {
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend(store(0.2, 11), now)).resolves.toMatchObject({ attention: false, detail: expect.stringContaining("«a fondo» apagado") });
    await expect(measureCopilotSpend(store(1, 11), now)).resolves.toMatchObject({ attention: true });
  });

  it("sin Redis lo dice, sin ponerse en rojo", async () => {
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend(null, now)).resolves.toMatchObject({ ok: null, attention: false });
  });
});
