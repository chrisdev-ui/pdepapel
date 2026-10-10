import { formatInTimeZone, zonedTimeToUtc } from "date-fns-tz";

import { AppError } from "@/lib/api-errors";
import type {
  AnalysisGenerate,
  AnalysisImage,
} from "@/lib/product-image-analysis-pipeline";
import type { z } from "zod";

export type AiProviderName = "gemini" | "openai";
/** Pasos del asistente de productos; «structured» es cualquier otra función (bot, Respuestas, iconos). */
export type AiStep = "facts" | "synthesis" | "category" | "structured";

export type AiProviderCall = {
  kind: AiStep;
  prompt: string;
  system?: string;
  images?: AnalysisImage[];
  schema: z.ZodTypeAny;
  abortSignal: AbortSignal;
  temperature?: number;
};

export type AiProviderUsage = { inputTokens?: number; outputTokens?: number };

export type AiProvider = {
  name: AiProviderName;
  model: (kind: AiStep) => string;
  /** USD por millón de tokens. */
  price: (kind: AiStep) => { input: number; output: number };
  call: (
    request: AiProviderCall,
  ) => Promise<{ output: unknown; usage?: AiProviderUsage }>;
};

/** La pasada final y la elección de subcategoría van con la temperatura mínima, para que repitan respuesta. */
export const DECISION_TEMPERATURE = 0;
/**
 * Tope diario de gasto en OpenAI (USD), compartido por todas las funciones.
 * El asistente de productos ya está limitado a 20 análisis por tienda al día
 * (≈ US$0,002 cada uno) y el bot gasta centésimas de centavo por mensaje:
 * US$1 deja varias veces ese uso y corta un ciclo desbocado en ≈ US$30 al mes.
 */
export const OPENAI_DAILY_SPEND_CAP_USD = 1;
const MINUTE_SKIP_SECONDS = 60;
const BILLING_SKIP_SECONDS = 60 * 60;
const MIN_CALL_MS = 8_000;
const GEMINI_RESET_TIME_ZONE = "America/Los_Angeles";

export const AI_BUSY_MINUTE_MESSAGE =
  "La IA está ocupada, intenta en un minuto.";
export const AI_BUSY_LATER_MESSAGE = "La IA está ocupada, intenta más tarde.";

export class AiBusyError extends AppError {
  constructor(message: string) {
    super(message, 429);
    this.name = "AiBusyError";
  }
}

export type ModelFailure =
  | { kind: "daily-quota" }
  | { kind: "minute-quota"; retryDelayMs: number | null }
  | { kind: "billing-quota" }
  | { kind: "spend-cap" }
  | { kind: "server" }
  | { kind: "timeout" }
  | { kind: "other" };

type ErrorLike = {
  name?: string;
  message?: string;
  statusCode?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  lastError?: unknown;
};

function parseRetryDelay(value: unknown) {
  const match = typeof value === "string" && value.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

function retryAfterMs(headers?: Record<string, string>) {
  const ms = Number(headers?.["retry-after-ms"]);
  if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms);
  const seconds = Number(headers?.["retry-after"]);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds * 1000)
    : null;
}

/** Qué le pasó al proveedor, leyendo el cuerpo de error de Gemini o de OpenAI. */
export function classifyModelError(error: unknown): ModelFailure {
  let current = error as ErrorLike | undefined;
  while (current?.lastError) current = current.lastError as ErrorLike;
  if (!current || typeof current !== "object") return { kind: "other" };
  if (
    current.name === "TimeoutError" ||
    current.name === "AbortError" ||
    /aborted|timed? ?out/i.test(current.message ?? "")
  ) {
    return { kind: "timeout" };
  }
  const status = current.statusCode;
  if (status && status >= 500) return { kind: "server" };
  if (
    status !== 429 &&
    !/resource_exhausted|insufficient_quota/i.test(current.message ?? "")
  ) {
    return { kind: "other" };
  }
  let body: {
    error?: {
      type?: string;
      code?: string;
      details?: Record<string, unknown>[];
    };
  } = {};
  try {
    body = JSON.parse(current.responseBody ?? "{}") ?? {};
  } catch {
    body = {};
  }
  if (
    [body.error?.type, body.error?.code].includes("insufficient_quota") ||
    /insufficient_quota/i.test(current.message ?? "")
  ) {
    return { kind: "billing-quota" };
  }
  const details = Array.isArray(body.error?.details) ? body.error.details : [];
  const quotaIds = details.flatMap((detail) =>
    Array.isArray(detail.violations)
      ? detail.violations.map((violation: { quotaId?: string }) =>
          String(violation.quotaId ?? ""),
        )
      : [],
  );
  if (quotaIds.some((id) => /PerDay/i.test(id))) return { kind: "daily-quota" };
  const retryInfo = details.find((detail) => "retryDelay" in detail);
  return {
    kind: "minute-quota",
    retryDelayMs:
      parseRetryDelay(retryInfo?.retryDelay) ??
      retryAfterMs(current.responseHeaders),
  };
}

/** Segundos hasta la próxima medianoche del Pacífico, cuando Google repone la cuota diaria. */
export function secondsUntilGeminiDailyReset(now = new Date()) {
  const today = formatInTimeZone(now, GEMINI_RESET_TIME_ZONE, "yyyy-MM-dd");
  const [year, month, day] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  const reset = zonedTimeToUtc(`${tomorrow}T00:00:00`, GEMINI_RESET_TIME_ZONE);
  return Math.max(60, Math.ceil((reset.getTime() - now.getTime()) / 1000));
}

export type AiRoutingStore = {
  get: (key: string) => Promise<unknown>;
  set: (
    key: string,
    value: string,
    options: { ex: number },
  ) => Promise<unknown>;
  incrbyfloat: (key: string, value: number) => Promise<unknown>;
  expire: (key: string, seconds: number) => Promise<unknown>;
};

export const providerSkipKey = (provider: AiProviderName) =>
  `ai:${provider}:skip`;
export const GEMINI_SKIP_KEY = providerSkipKey("gemini");
export const openAiSpendKey = (now: Date) =>
  `ai:openai:spend:${now.toISOString().slice(0, 10)}`;

export type AiCallLog = {
  step: AiStep;
  feature?: string;
  provider: AiProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  usd: number;
  ok: boolean;
  failure?: ModelFailure["kind"];
};

export function estimateCost(
  price: { input: number; output: number },
  usage?: AiProviderUsage,
) {
  return (
    ((usage?.inputTokens ?? 0) * price.input +
      (usage?.outputTokens ?? 0) * price.output) /
    1e6
  );
}

function skipSeconds(
  provider: AiProviderName,
  failure: ModelFailure,
  now: Date,
) {
  switch (failure.kind) {
    case "daily-quota":
      return provider === "gemini"
        ? secondsUntilGeminiDailyReset(now)
        : BILLING_SKIP_SECONDS;
    case "billing-quota":
      return BILLING_SKIP_SECONDS;
    case "minute-quota":
      return MINUTE_SKIP_SECONDS;
    default:
      return null;
  }
}

/**
 * Elige proveedor por llamada: el principal primero y el de respaldo cuando
 * el principal se quedó sin cuota, falla del lado del servidor, se demora o
 * (si es OpenAI) llegó al tope de gasto del día. Las marcas en Redis evitan
 * insistir con un proveedor mientras no se repone.
 */
export function createAiRouter(options: {
  primary: AiProvider;
  fallback?: AiProvider | null;
  store?: AiRoutingStore | null;
  /** Instante (ms) en que se acaba el presupuesto del pedido. */
  deadline: number;
  /** Solo para medir: un proveedor fijo, sin respaldo ni tope de gasto. */
  force?: AiProviderName;
  feature?: string;
  spendCapUsd?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (entry: AiCallLog) => void;
}) {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log =
    options.log ??
    ((entry: AiCallLog) => console.info("[AI_MODEL_CALL]", entry));
  const spendCap = options.spendCapUsd ?? OPENAI_DAILY_SPEND_CAP_USD;
  const providers = [options.primary, options.fallback].filter(
    (provider): provider is AiProvider => Boolean(provider),
  );
  const order = options.force
    ? providers.filter((provider) => provider.name === options.force)
    : providers;
  const used = new Set<AiProviderName>();
  const down = new Set<AiProviderName>();
  let spentToday: number | null = null;

  const safely = async <T>(work: () => Promise<T>, fallback: T) => {
    try {
      return await work();
    } catch (error) {
      console.error("[AI_ROUTING_STORE]", error);
      return fallback;
    }
  };

  const isSkipped = async (provider: AiProviderName) =>
    options.store
      ? Boolean(
          await safely(
            () => options.store!.get(providerSkipKey(provider)),
            null,
          ),
        )
      : false;

  const remember = async (provider: AiProviderName, failure: ModelFailure) => {
    const seconds = skipSeconds(provider, failure, new Date(now()));
    if (!options.store || !seconds) return;
    await safely(
      () =>
        options.store!.set(providerSkipKey(provider), failure.kind, {
          ex: seconds,
        }),
      null,
    );
  };

  const capReached = async () => {
    if (options.force) return false;
    if (spentToday === null) {
      spentToday = options.store
        ? Number(
            (await safely(
              () => options.store!.get(openAiSpendKey(new Date(now()))),
              0,
            )) ?? 0,
          )
        : 0;
    }
    return spentToday >= spendCap;
  };

  const addSpend = async (usd: number) => {
    if (usd <= 0) return;
    spentToday = (spentToday ?? 0) + usd;
    if (!options.store) return;
    const key = openAiSpendKey(new Date(now()));
    await safely(async () => {
      await options.store!.incrbyfloat(key, usd);
      await options.store!.expire(key, 60 * 60 * 48);
    }, null);
  };

  const invoke = async (provider: AiProvider, request: AiProviderCall) => {
    const t0 = now();
    const model = provider.model(request.kind);
    try {
      const result = await provider.call({
        ...request,
        temperature:
          request.kind === "synthesis" || request.kind === "category"
            ? DECISION_TEMPERATURE
            : undefined,
      });
      const usd = estimateCost(provider.price(request.kind), result.usage);
      log({
        step: request.kind,
        feature: options.feature,
        provider: provider.name,
        model,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        ms: now() - t0,
        usd,
        ok: true,
      });
      used.add(provider.name);
      if (provider.name === "openai") await addSpend(usd);
      return result;
    } catch (error) {
      log({
        step: request.kind,
        feature: options.feature,
        provider: provider.name,
        model,
        inputTokens: 0,
        outputTokens: 0,
        ms: now() - t0,
        usd: 0,
        ok: false,
        failure: classifyModelError(error).kind,
      });
      throw error;
    }
  };

  const busy = (failure: ModelFailure | null) =>
    new AiBusyError(
      failure?.kind === "minute-quota"
        ? AI_BUSY_MINUTE_MESSAGE
        : AI_BUSY_LATER_MESSAGE,
    );

  const call = async (request: AiProviderCall) => {
    if (options.force) {
      if (!order[0])
        throw new Error(`Proveedor ${options.force} sin configurar`);
      return invoke(order[0], request);
    }
    const only = order.length === 1;
    let lastFailure: ModelFailure | null = null;
    let attempts = 0;
    const skippedDown: AiProvider[] = [];
    for (const provider of order) {
      if (down.has(provider.name)) {
        skippedDown.push(provider);
        continue;
      }
      if (!only && (await isSkipped(provider.name))) continue;
      if (provider.name === "openai" && (await capReached())) {
        lastFailure = { kind: "spend-cap" };
        continue;
      }
      const left = options.deadline - now();
      if (attempts > 0 && left < MIN_CALL_MS) break;
      const abortSignal =
        attempts > 0 || request.abortSignal.aborted
          ? AbortSignal.timeout(Math.max(1, left))
          : request.abortSignal;
      attempts += 1;
      try {
        return await invoke(provider, { ...request, abortSignal });
      } catch (error) {
        const failure = classifyModelError(error);
        // Un error de formato se reintenta con el mismo proveedor (lo hace quien llama).
        if (failure.kind === "other") throw error;
        await remember(provider.name, failure);
        lastFailure = failure;
        if (
          (failure.kind === "server" || failure.kind === "timeout") &&
          !only
        ) {
          down.add(provider.name);
        }
        // Tras un timeout la señal ya venció: quien llama reintenta y pasa al siguiente.
        if (failure.kind === "timeout" && attempts === 1) throw error;
      }
    }

    // El respaldo no pudo: el principal, que solo se demoró o falló una vez, tiene otro intento.
    for (const provider of skippedDown) {
      const left = options.deadline - now();
      if (left < MIN_CALL_MS) break;
      try {
        return await invoke(provider, {
          ...request,
          abortSignal: request.abortSignal.aborted
            ? AbortSignal.timeout(left)
            : request.abortSignal,
        });
      } catch (error) {
        const failure = classifyModelError(error);
        if (failure.kind === "other") throw error;
        lastFailure = failure;
      }
    }

    if (only && lastFailure?.kind === "minute-quota") {
      const wait = lastFailure.retryDelayMs ?? MINUTE_SKIP_SECONDS * 1000;
      if (wait + MIN_CALL_MS > options.deadline - now()) {
        throw busy(lastFailure);
      }
      await sleep(wait);
      try {
        return await invoke(order[0], {
          ...request,
          abortSignal: AbortSignal.timeout(options.deadline - now()),
        });
      } catch (retryError) {
        const failure = classifyModelError(retryError);
        if (failure.kind === "other") throw retryError;
        throw busy(failure);
      }
    }
    throw busy(lastFailure);
  };

  const generate: AnalysisGenerate = async (request) =>
    call({
      kind: request.kind,
      prompt: request.prompt,
      images: request.images,
      schema: request.schema,
      abortSignal: request.abortSignal,
    });

  return {
    call,
    generate,
    providersUsed: () => Array.from(used),
  };
}

/**
 * Una llamada con salida estructurada para las funciones fuera del asistente
 * de productos. Si el principal se demora, prueba una vez con el respaldo.
 */
export async function runStructured<T extends z.ZodTypeAny>(input: {
  feature: string;
  schema: T;
  prompt: string;
  system?: string;
  primary: AiProvider;
  fallback?: AiProvider | null;
  store?: AiRoutingStore | null;
  timeoutMs: number;
  log?: (entry: AiCallLog) => void;
}): Promise<{
  output: z.output<T>;
  provider: AiProviderName;
  usage?: AiProviderUsage;
}> {
  const router = createAiRouter({
    primary: input.primary,
    fallback: input.fallback,
    store: input.store,
    feature: input.feature,
    deadline: Date.now() + input.timeoutMs * (input.fallback ? 2 : 1),
    log: input.log,
  });
  const request = (): AiProviderCall => ({
    kind: "structured",
    prompt: input.prompt,
    system: input.system,
    schema: input.schema,
    abortSignal: AbortSignal.timeout(input.timeoutMs),
  });
  let result;
  try {
    result = await router.call(request());
  } catch (error) {
    if (!input.fallback || classifyModelError(error).kind !== "timeout") {
      throw error;
    }
    result = await router.call(request());
  }
  return {
    output: input.schema.parse(result.output),
    provider: router.providersUsed().at(-1) ?? input.primary.name,
    usage: result.usage,
  };
}
