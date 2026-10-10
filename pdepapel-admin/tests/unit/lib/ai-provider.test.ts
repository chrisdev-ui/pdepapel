import { APICallError } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  AI_BUSY_LATER_MESSAGE,
  AI_BUSY_MINUTE_MESSAGE,
  GEMINI_SKIP_KEY,
  DECISION_TEMPERATURE,
  classifyModelError,
  createAiRouter,
  runStructured,
  openAiSpendKey,
  secondsUntilGeminiDailyReset,
  type AiProvider,
  type AiRoutingStore,
} from "@/lib/ai-provider";

function quotaError(quotaId: string, retryDelay = "37s") {
  return new APICallError({
    message: "You exceeded your current quota",
    url: "https://generativelanguage.googleapis.com",
    requestBodyValues: {},
    statusCode: 429,
    responseBody: JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId }],
          },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
        ],
      },
    }),
  });
}
const DAILY = "GenerateRequestsPerDayPerProjectPerModel-FreeTier";
const MINUTE = "GenerateRequestsPerMinutePerProjectPerModel-FreeTier";
const serverError = () =>
  new APICallError({
    message: "Internal error",
    url: "https://generativelanguage.googleapis.com",
    requestBodyValues: {},
    statusCode: 503,
  });
const timeoutError = () =>
  Object.assign(new Error("The operation was aborted due to timeout"), {
    name: "TimeoutError",
  });

function provider(
  name: "gemini" | "openai",
  results: (unknown | Error)[],
): AiProvider & { calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    return {
      output: next ?? { ok: name },
      usage: { inputTokens: 1000, outputTokens: 100 },
    };
  });
  return {
    name,
    model: () => `${name}-model`,
    price: () => ({ input: 0.1, output: 0.5 }),
    call: calls,
    calls,
  };
}

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const ttl = new Map<string, number>();
  const store: AiRoutingStore = {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value, { ex }) => {
      data.set(key, value);
      ttl.set(key, ex);
    },
    incrbyfloat: async (key, value) => {
      data.set(key, Number(data.get(key) ?? 0) + value);
    },
    expire: async (key, seconds) => {
      ttl.set(key, seconds);
    },
  };
  return { store, data, ttl };
}

const request = (kind: "facts" | "synthesis" | "category" = "facts") => ({
  kind,
  prompt: "p",
  imageUrls: [],
  photoNumbers: [0],
  schema: z.any(),
  abortSignal: new AbortController().signal,
});

function router(
  primary: AiProvider,
  fallback: AiProvider | null,
  extra: Partial<Parameters<typeof createAiRouter>[0]> = {},
) {
  return createAiRouter({
    primary,
    fallback,
    deadline: Date.now() + 55_000,
    log: () => {},
    sleep: async () => {},
    ...extra,
  });
}

const openAiQuota = (type: "rate_limit_exceeded" | "insufficient_quota") =>
  new APICallError({
    message: type,
    url: "https://api.openai.com",
    requestBodyValues: {},
    statusCode: 429,
    responseHeaders: { "retry-after": "7" },
    responseBody: JSON.stringify({ error: { type, code: type } }),
  });

describe("clasificación de errores del modelo", () => {
  it("distingue cuota diaria, por minuto (con retryDelay), 5xx y timeout", () => {
    expect(classifyModelError(quotaError(DAILY))).toEqual({
      kind: "daily-quota",
    });
    expect(classifyModelError(quotaError(MINUTE, "12.5s"))).toEqual({
      kind: "minute-quota",
      retryDelayMs: 12_500,
    });
    expect(classifyModelError(serverError())).toEqual({ kind: "server" });
    expect(classifyModelError(timeoutError())).toEqual({ kind: "timeout" });
    expect(classifyModelError(new Error("schema mismatch"))).toEqual({
      kind: "other",
    });
  });

  it("mira el último error cuando el SDK lo envuelve en reintentos", () => {
    expect(classifyModelError({ lastError: quotaError(DAILY) })).toEqual({
      kind: "daily-quota",
    });
  });
});

describe("medianoche del Pacífico", () => {
  it("usa 07:00 UTC en horario de verano y 08:00 UTC desde noviembre", () => {
    expect(secondsUntilGeminiDailyReset(new Date("2026-10-10T06:00:00Z"))).toBe(
      3600,
    );
    expect(secondsUntilGeminiDailyReset(new Date("2026-11-10T07:00:00Z"))).toBe(
      3600,
    );
  });
});

describe("errores de OpenAI", () => {
  it("límite por minuto (con retry-after) y cuota de facturación agotada", () => {
    expect(classifyModelError(openAiQuota("rate_limit_exceeded"))).toEqual({
      kind: "minute-quota",
      retryDelayMs: 7_000,
    });
    expect(classifyModelError(openAiQuota("insufficient_quota"))).toEqual({
      kind: "billing-quota",
    });
  });
});

describe("OpenAI principal, Gemini de respaldo", () => {
  it("OpenAI responde: Gemini nunca se llama", async () => {
    const openai = provider("openai", [{ from: "openai" }]);
    const gemini = provider("gemini", []);
    const r = router(openai, gemini);
    await expect(r.generate(request())).resolves.toMatchObject({
      output: { from: "openai" },
    });
    expect(gemini.calls).not.toHaveBeenCalled();
    expect(r.providersUsed()).toEqual(["openai"]);
  });

  it.each([
    [
      "429 por minuto",
      () => openAiQuota("rate_limit_exceeded"),
      "minute-quota",
      60,
    ],
    [
      "sin saldo",
      () => openAiQuota("insufficient_quota"),
      "billing-quota",
      3600,
    ],
  ])(
    "OpenAI con %s: responde Gemini y OpenAI se salta un rato",
    async (_label, error, mark, seconds) => {
      const { store, data, ttl } = memoryStore();
      const gemini = provider("gemini", [{ from: "gemini" }]);
      const r = router(provider("openai", [error()]), gemini, { store });
      await expect(r.generate(request())).resolves.toMatchObject({
        output: { from: "gemini" },
      });
      expect(data.get("ai:openai:skip")).toBe(mark);
      expect(ttl.get("ai:openai:skip")).toBe(seconds);

      const later = provider("openai", []);
      await router(later, provider("gemini", []), { store }).generate(
        request(),
      );
      expect(later.calls).not.toHaveBeenCalled();
    },
  );

  it("OpenAI con 5xx: responde Gemini en la misma llamada", async () => {
    const r = router(
      provider("openai", [serverError()]),
      provider("gemini", [{ from: "gemini" }]),
    );
    await expect(r.generate(request())).resolves.toMatchObject({
      output: { from: "gemini" },
    });
  });

  it("OpenAI se demora: el reintento de quien llama va a Gemini", async () => {
    const openai = provider("openai", [timeoutError()]);
    const gemini = provider("gemini", [{ from: "gemini" }]);
    const r = router(openai, gemini);
    await expect(r.generate(request())).rejects.toThrow(/timeout/);
    await expect(r.generate(request())).resolves.toMatchObject({
      output: { from: "gemini" },
    });
    expect(openai.calls).toHaveBeenCalledTimes(1);
  });

  it("tope diario de OpenAI alcanzado: va directo a Gemini, sin llamar a OpenAI", async () => {
    const openai = provider("openai", []);
    const { store } = memoryStore({ [openAiSpendKey(new Date())]: 5 });
    const r = router(openai, provider("gemini", [{ from: "gemini" }]), {
      store,
      spendCapUsd: 1,
    });
    await expect(r.generate(request())).resolves.toMatchObject({
      output: { from: "gemini" },
    });
    expect(openai.calls).not.toHaveBeenCalled();
  });

  it("tope alcanzado y sin respaldo: «intenta más tarde»", async () => {
    const { store } = memoryStore({ [openAiSpendKey(new Date())]: 5 });
    const r = router(provider("openai", []), null, { store, spendCapUsd: 1 });
    await expect(r.generate(request())).rejects.toThrow(AI_BUSY_LATER_MESSAGE);
  });

  it("suma el costo estimado de OpenAI al gasto del día", async () => {
    const { store, data } = memoryStore();
    await router(provider("openai", []), null, { store }).generate(request());
    expect(data.get(openAiSpendKey(new Date()))).toBeCloseTo(
      (1000 * 0.1 + 100 * 0.5) / 1e6,
    );
  });

  it("OpenAI se demora y Gemini está sin cuota: OpenAI tiene un segundo intento si queda tiempo", async () => {
    const openai = provider("openai", [timeoutError(), { from: "openai" }]);
    const gemini = provider("gemini", [quotaError(DAILY)]);
    const r = router(openai, gemini);
    await expect(r.generate(request())).rejects.toThrow(/timeout/);
    await expect(r.generate(request())).resolves.toMatchObject({ output: { from: "openai" } });
    expect(openai.calls).toHaveBeenCalledTimes(2);
  });

  it("si fallan los dos: mensaje amable", async () => {
    const r = router(
      provider("openai", [serverError()]),
      provider("gemini", [serverError()]),
    );
    await expect(r.generate(request())).rejects.toThrow(AI_BUSY_LATER_MESSAGE);
  });

  it("Gemini sin cuota diaria como respaldo: queda marcado hasta la medianoche del Pacífico", async () => {
    const at = Date.parse("2026-10-10T06:00:00Z");
    const { store, data, ttl } = memoryStore();
    const r = router(
      provider("openai", [serverError()]),
      provider("gemini", [quotaError(DAILY)]),
      {
        store,
        now: () => at,
        deadline: at + 55_000,
      },
    );
    await expect(r.generate(request())).rejects.toThrow(AI_BUSY_LATER_MESSAGE);
    expect(data.get(GEMINI_SKIP_KEY)).toBe("daily-quota");
    expect(ttl.get(GEMINI_SKIP_KEY)).toBe(3600);
  });

  it("un error de formato no cambia de proveedor", async () => {
    const gemini = provider("gemini", []);
    const r = router(
      provider("openai", [new Error("schema mismatch")]),
      gemini,
    );
    await expect(r.generate(request())).rejects.toThrow("schema mismatch");
    expect(gemini.calls).not.toHaveBeenCalled();
  });

  it("forzar un proveedor (solo para medir) no usa el otro ni respeta el tope", async () => {
    const gemini = provider("gemini", []);
    const openai = provider("openai", []);
    const { store } = memoryStore({ [openAiSpendKey(new Date())]: 5 });
    await router(openai, gemini, {
      store,
      force: "openai",
      spendCapUsd: 1,
    }).generate(request());
    expect(gemini.calls).not.toHaveBeenCalled();
    expect(openai.calls).toHaveBeenCalledTimes(1);
  });

  it("la pasada final y la subcategoría van con temperatura mínima; la lectura de fotos y las otras funciones no", async () => {
    const openai = provider("openai", []);
    const r = router(openai, null);
    for (const kind of [
      "synthesis",
      "category",
      "facts",
      "structured",
    ] as const)
      await r.generate(request(kind as never));
    expect(openai.calls.mock.calls.map(([call]) => call.temperature)).toEqual([
      DECISION_TEMPERATURE,
      DECISION_TEMPERATURE,
      undefined,
      undefined,
    ]);
  });
});

describe("un solo proveedor (Preview, sin clave de OpenAI)", () => {
  it("429 por minuto: espera el retryDelay y reintenta una vez si cabe en el presupuesto", async () => {
    const gemini = provider("gemini", [
      quotaError(MINUTE, "10s"),
      { ok: true },
    ]);
    const sleep = vi.fn(async () => {});
    const r = router(gemini, null, { sleep });
    await expect(r.generate(request())).resolves.toMatchObject({
      output: { ok: true },
    });
    expect(sleep).toHaveBeenCalledWith(10_000);
    expect(gemini.calls).toHaveBeenCalledTimes(2);
  });

  it("si el retryDelay no cabe en el presupuesto: «intenta en un minuto»", async () => {
    const gemini = provider("gemini", [quotaError(MINUTE, "50s")]);
    const r = router(gemini, null, { deadline: Date.now() + 30_000 });
    await expect(r.generate(request())).rejects.toThrow(AI_BUSY_MINUTE_MESSAGE);
    expect(gemini.calls).toHaveBeenCalledTimes(1);
  });

  it("cuota diaria: «intenta más tarde»", async () => {
    const r = router(provider("gemini", [quotaError(DAILY)]), null);
    await expect(r.generate(request())).rejects.toThrow(AI_BUSY_LATER_MESSAGE);
  });

  it("un timeout se lanza tal cual para que el pipeline reintente con el mismo", async () => {
    const gemini = provider("gemini", [timeoutError(), { ok: true }]);
    const r = router(gemini, null);
    await expect(r.generate(request())).rejects.toThrow(/timeout/);
    await expect(r.generate(request())).resolves.toMatchObject({
      output: { ok: true },
    });
  });
});

describe("runStructured (bot, Respuestas, iconos)", () => {
  const schema = z.object({ answer: z.string() });

  it("devuelve la salida validada y quién respondió", async () => {
    const result = await runStructured({
      feature: "prueba",
      schema,
      prompt: "p",
      primary: provider("openai", [{ answer: "sí" }]),
      timeoutMs: 5_000,
      log: () => {},
    });
    expect(result).toMatchObject({
      output: { answer: "sí" },
      provider: "openai",
    });
  });

  it("si el principal se demora, prueba una vez con el respaldo", async () => {
    const result = await runStructured({
      feature: "prueba",
      schema,
      prompt: "p",
      primary: provider("openai", [timeoutError()]),
      fallback: provider("gemini", [{ answer: "respaldo" }]),
      timeoutMs: 5_000,
      log: () => {},
    });
    expect(result).toMatchObject({
      output: { answer: "respaldo" },
      provider: "gemini",
    });
  });

  it("sin respaldo, un fallo se lanza y quien llama decide (el bot pasa a palabras clave)", async () => {
    await expect(
      runStructured({
        feature: "prueba",
        schema,
        prompt: "p",
        primary: provider("openai", [serverError()]),
        timeoutMs: 5_000,
        log: () => {},
      }),
    ).rejects.toThrow(AI_BUSY_LATER_MESSAGE);
  });
});
