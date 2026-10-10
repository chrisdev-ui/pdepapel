import { beforeEach, describe, expect, it, vi } from "vitest";

/** «Sistemas» en Inicio: mensajes del bot por cada mensaje de clienta en 24 h. */
const mocks = vi.hoisted(() => ({ count: vi.fn(), answers: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: { conversationMessage: { count: mocks.count }, assistantMessage: { count: mocks.answers } },
}));

import { measureWhatsAppBotRatio, WHATSAPP_BOT_RATIO_LIMIT } from "@/lib/job-runs";

const now = new Date("2026-10-10T19:00:00.000Z");
const counts = (inbound: number, bot: number) => mocks.count.mockResolvedValueOnce(inbound).mockResolvedValueOnce(bot);

beforeEach(() => {
  mocks.count.mockReset();
  mocks.answers.mockReset();
});

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
  const answered = (today: number, month: number) => mocks.answers.mockResolvedValueOnce(today).mockResolvedValueOnce(month);

  it("por debajo de un centavo muestra 4 decimales y cuenta las respuestas del día y del mes", async () => {
    answered(2, 2);
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend("store-1", store(0.00026907, 0.00026907), now)).resolves.toMatchObject({
      name: "copilot-spend",
      metric: true,
      attention: false,
      detail: "Hoy USD 0,0003 de USD 1,00 (2 respuestas) · mes USD 0,0003 de USD 15,00 (2 respuestas)",
    });
  });

  it("desde un centavo vuelve a 2 decimales; sin gasto dice 0,00", async () => {
    answered(1, 40);
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend("store-1", store(0.12, 3.4), now)).resolves.toMatchObject({
      detail: "Hoy USD 0,12 de USD 1,00 (1 respuesta) · mes USD 3,40 de USD 15,00 (40 respuestas)",
    });
    answered(0, 0);
    await expect(measureCopilotSpend("store-1", store(0, 0), now)).resolves.toMatchObject({
      detail: "Hoy USD 0,00 de USD 1,00 (0 respuestas) · mes USD 0,00 de USD 15,00 (0 respuestas)",
    });
  });

  it("cuenta con los mismos cortes UTC que las claves del gasto y solo de esta tienda", async () => {
    answered(0, 0);
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await measureCopilotSpend("store-1", store(0, 0), now);
    const [day, month] = mocks.answers.mock.calls.map((call) => call[0].where);
    expect(day).toEqual({ role: "assistant", createdAt: { gte: new Date("2026-10-10T00:00:00.000Z") }, conversation: { storeId: "store-1" } });
    expect(month.createdAt.gte).toEqual(new Date("2026-10-01T00:00:00.000Z"));
  });

  it("si el conteo falla, muestra el gasto sin conteo", async () => {
    mocks.answers.mockRejectedValue(new Error("caída"));
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend("store-1", store(0.2, 3), now)).resolves.toMatchObject({
      ok: true,
      detail: "Hoy USD 0,20 de USD 1,00 · mes USD 3,00 de USD 15,00",
    });
  });

  it("avisa cuando «a fondo» se apagó y se pone en rojo al llegar a un tope", async () => {
    mocks.answers.mockResolvedValue(3);
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend("store-1", store(0.2, 11), now)).resolves.toMatchObject({ attention: false, detail: expect.stringContaining("«a fondo» apagado") });
    await expect(measureCopilotSpend("store-1", store(1, 11), now)).resolves.toMatchObject({ attention: true });
  });

  it("sin Redis lo dice, sin ponerse en rojo", async () => {
    const { measureCopilotSpend } = await import("@/lib/job-runs");
    await expect(measureCopilotSpend("store-1", null, now)).resolves.toMatchObject({ ok: null, attention: false });
  });
});
