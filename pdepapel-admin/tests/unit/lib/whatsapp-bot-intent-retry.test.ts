import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runStructured: vi.fn() }));

vi.mock("@/lib/env.mjs", () => ({ env: { OPENAI_API_KEY: "sk-prueba" } }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/ai-model-providers", () => ({
  createAiProviders: () => ({ openai: { name: "openai" } }),
  getAiRoutingStore: () => null,
}));
vi.mock("@/lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-provider")>()),
  runStructured: mocks.runStructured,
}));

import { AiBusyError } from "@/lib/ai-provider";
import { BOT_INTENT_TIMEOUT_MS, classifyMessageIntent } from "@/lib/whatsapp/bot-intent";

const bueno = { output: { intent: "thanks", productIntent: null, query: null, filters: { theme: null, category: null, recipient: null, budget: null } } };

describe("un fallo pasajero del clasificador se reintenta una vez", () => {
  beforeEach(() => mocks.runStructured.mockReset());

  it("una respuesta que no se pudo leer: segundo intento y sale bien", async () => {
    mocks.runStructured.mockRejectedValueOnce(new Error("No object generated")).mockResolvedValueOnce(bueno);
    await expect(classifyMessageIntent("gracias")).resolves.toMatchObject({ ok: true, value: { intent: "thanks" } });
    expect(mocks.runStructured).toHaveBeenCalledTimes(2);
  });

  it("solo una vez: si vuelve a fallar, el bot sigue por el camino de antes", async () => {
    mocks.runStructured
      .mockRejectedValueOnce(new Error("No object generated"))
      .mockRejectedValueOnce(new Error("No object generated"));
    const resultado = await classifyMessageIntent("gracias");
    expect(resultado).toEqual({ ok: false, reason: "error" });
    expect(mocks.runStructured).toHaveBeenCalledTimes(2);
  });

  it("sin cuota no se reintenta: no hay saldo que gastar", async () => {
    mocks.runStructured.mockRejectedValueOnce(new AiBusyError("ocupada"));
    await expect(classifyMessageIntent("gracias")).resolves.toEqual({ ok: false, reason: "quota" });
    expect(mocks.runStructured).toHaveBeenCalledTimes(1);
  });

  it("una llamada colgada se corta a los 6 s y se intenta otra vez; dos veces colgada, camino de antes", async () => {
    const colgada = () => Object.assign(new Error("aborted due to timeout"), { name: "TimeoutError" });
    mocks.runStructured.mockRejectedValueOnce(colgada()).mockResolvedValueOnce(bueno);
    await expect(classifyMessageIntent("gracias")).resolves.toMatchObject({ ok: true });
    mocks.runStructured.mockRejectedValueOnce(colgada()).mockRejectedValueOnce(colgada());
    await expect(classifyMessageIntent("gracias")).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(mocks.runStructured).toHaveBeenCalledTimes(4);
    expect(mocks.runStructured.mock.calls[0][0].timeoutMs).toBe(BOT_INTENT_TIMEOUT_MS);
    expect(BOT_INTENT_TIMEOUT_MS).toBe(6_000);
  });
});
