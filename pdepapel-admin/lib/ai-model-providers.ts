import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Redis } from "@upstash/redis";
import {
  generateText,
  jsonSchema,
  NoObjectGeneratedError,
  Output,
  zodSchema,
  type JSONSchema7,
} from "ai";
import type { z } from "zod";

import type {
  AiProvider,
  AiProviderCall,
  AiRoutingStore,
  AiStep,
} from "@/lib/ai-provider";

/** USD por millón de tokens (ai.google.dev/gemini-api/docs/pricing, leído 2026-10-09). */
const GEMINI_FLASH_LITE_PRICE = { input: 0.3, output: 2.5 };
export const GEMINI_ANALYSIS_MODEL = "gemini-3.5-flash-lite";

/** Respuesta que no se pudo leer: se registra el motivo y el largo, nunca el contenido. */
function logParseFailure(provider: string, step: AiStep, error: unknown) {
  if (!NoObjectGeneratedError.isInstance(error)) return;
  let cause: unknown = error.cause;
  while (
    cause &&
    typeof cause === "object" &&
    !("issues" in cause) &&
    "cause" in cause
  ) {
    cause = (cause as { cause?: unknown }).cause;
  }
  const issues =
    cause &&
    typeof cause === "object" &&
    "issues" in cause &&
    Array.isArray(cause.issues)
      ? (cause.issues as { path?: (string | number)[]; code?: string }[])
          .slice(0, 5)
          .map((issue) => `${(issue.path ?? []).join(".")}:${issue.code}`)
      : [];
  console.warn("[AI_PARSE_FAILURE]", {
    provider,
    step,
    finishReason: error.finishReason,
    length: error.text?.length ?? 0,
    outputTokens: error.usage?.outputTokens,
    issues,
  });
}

function toMessages(request: AiProviderCall) {
  return [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: request.prompt },
        ...(request.images ?? []).map((image) => ({
          type: "file" as const,
          mediaType: image.mediaType,
          data: image.data,
        })),
      ],
    },
  ];
}

const GEMINI_SCHEMA_KEYS = new Set([
  "type",
  "description",
  "required",
  "format",
  "enum",
  "const",
  "properties",
  "items",
  "allOf",
  "anyOf",
  "oneOf",
  "minLength",
  "$ref",
  "$defs",
  "definitions",
]);
const SCHEMA_MAPS = new Set(["properties", "$defs", "definitions"]);
const SCHEMA_VALUES = new Set(["enum", "const", "required"]);

/**
 * Gemini rechaza con «invalid argument» un esquema grande con topes, mínimos y
 * patrones. Se le manda solo la forma (lo mismo que mandaba la conversión a
 * OpenAPI del SDK hasta 4.0.50) y la respuesta se valida con el zod completo.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => GEMINI_SCHEMA_KEYS.has(key))
      .map(([key, value]) => [
        key,
        SCHEMA_VALUES.has(key)
          ? value
          : SCHEMA_MAPS.has(key)
            ? Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(
                  ([name, definition]) => [name, toGeminiSchema(definition)],
                ),
              )
            : toGeminiSchema(value),
      ]),
  );
}

/** Esquema de salida para Gemini: la forma recortada al modelo, el zod completo al validar. */
export function geminiOutputSchema<T extends z.ZodTypeAny>(schema: T) {
  const full = zodSchema(schema);
  return jsonSchema<z.output<T>>(
    async () => toGeminiSchema(await full.jsonSchema) as JSONSchema7,
    {
      validate: (value) => {
        const parsed = schema.safeParse(value);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { success: false, error: parsed.error };
      },
    },
  );
}

export function createGeminiProvider(apiKey: string): AiProvider {
  const google = createGoogleGenerativeAI({ apiKey });
  return {
    name: "gemini",
    model: () => GEMINI_ANALYSIS_MODEL,
    price: () => GEMINI_FLASH_LITE_PRICE,
    call: async (request) => {
      const result = await generateText({
        model: google(GEMINI_ANALYSIS_MODEL),
        output: Output.object({ schema: geminiOutputSchema(request.schema) }),
        abortSignal: request.abortSignal,
        temperature: request.temperature,
        maxRetries: 0,
        messages: toMessages(request),
        ...(request.system ? { system: request.system } : {}),
      }).catch((error) => {
        logParseFailure("gemini", request.kind, error);
        throw error;
      });
      return { output: result.output, usage: result.usage };
    },
  };
}

/** USD por millón de tokens (developers.openai.com/api/docs/pricing, leído 2026-10-10). */
const GPT_6_LUNA_PRICE = { input: 0.1, output: 0.5 };
export const OPENAI_ANALYSIS_MODEL = "gpt-6-luna";

export type OpenAiReasoningEffort = "none" | "low" | "medium";

export function createOpenAiProvider(
  apiKey: string,
  options: {
    /** Pasos con salida estricta (JSON siempre válido); los demás van en modo no estricto. */
    strict?: Partial<Record<AiStep, boolean>>;
    effort?: Partial<Record<AiStep, OpenAiReasoningEffort>>;
  } = {},
): AiProvider {
  const openai = createOpenAI({ apiKey });
  return {
    name: "openai",
    model: () => OPENAI_ANALYSIS_MODEL,
    price: () => GPT_6_LUNA_PRICE,
    call: async (request) => {
      // GPT-6 no acepta temperature: la respuesta estable sale del esfuerzo de razonamiento fijo y de las opciones cerradas.
      const effort = options.effort?.[request.kind] ?? "none";
      const strict = options.strict?.[request.kind] ?? false;
      const result = await generateText({
        model: openai(OPENAI_ANALYSIS_MODEL),
        output: Output.object({
          schema: strict
            ? openAiStrictOutputSchema(request.schema)
            : request.schema,
        }),
        abortSignal: request.abortSignal,
        maxRetries: 0,
        providerOptions: {
          openai: {
            reasoningEffort: effort,
            ...(effort === "none" ? {} : { reasoningSummary: null }),
            store: false,
            strictJsonSchema: strict,
          },
        },
        messages: toMessages(request),
        ...(request.system ? { system: request.system } : {}),
      }).catch((error) => {
        logParseFailure("openai", request.kind, error);
        throw error;
      });
      return { output: result.output, usage: result.usage };
    },
  };
}

/** La pasada final va en modo estricto: en modo libre 3 de 22 respuestas no eran JSON legible. */
export const OPENAI_STRICT_STEPS: Partial<Record<AiStep, boolean>> = {
  synthesis: true,
};

/** Esfuerzo de razonamiento por paso en OpenAI; lo que no está, va en "none". */
export const OPENAI_STEP_EFFORT: Partial<
  Record<AiStep, OpenAiReasoningEffort>
> = {};

/** Los proveedores con clave configurada. OpenAI va primero cuando existe. */
export function createAiProviders(keys: {
  openai?: string | null;
  gemini?: string | null;
}) {
  const openai = keys.openai
    ? createOpenAiProvider(keys.openai, {
        effort: OPENAI_STEP_EFFORT,
        strict: OPENAI_STRICT_STEPS,
      })
    : null;
  const gemini = keys.gemini ? createGeminiProvider(keys.gemini) : null;
  return {
    openai,
    gemini,
    primary: openai ?? gemini,
    fallback: openai ? gemini : null,
  };
}

/** Redis para las marcas de proveedor y el gasto del día; sin Redis se enruta igual, sin memoria entre pedidos. */
export function getAiRoutingStore(): AiRoutingStore | null {
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

const STRICT_SCHEMA_KEYS = new Set([
  "type",
  "description",
  "required",
  "enum",
  "const",
  "properties",
  "items",
  "anyOf",
  "$ref",
  "$defs",
  "definitions",
]);

type SchemaNode = Record<string, unknown>;

const isNode = (value: unknown): value is SchemaNode =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function allowsNull(node: SchemaNode): boolean {
  const type = node.type;
  if (type === "null" || (Array.isArray(type) && type.includes("null"))) {
    return true;
  }
  if (Array.isArray(node.enum) && node.enum.includes(null)) return true;
  return (
    Array.isArray(node.anyOf) &&
    node.anyOf.some((branch) => isNode(branch) && allowsNull(branch))
  );
}

function makeNullable(node: SchemaNode): SchemaNode {
  if (allowsNull(node)) return node;
  if (Array.isArray(node.anyOf)) {
    return { ...node, anyOf: [...node.anyOf, { type: "null" }] };
  }
  if (typeof node.type === "string") {
    return {
      ...node,
      type: [node.type, "null"],
      ...(Array.isArray(node.enum) ? { enum: [...node.enum, null] } : {}),
    };
  }
  return { anyOf: [node, { type: "null" }] };
}

/**
 * Esquema que acepta el modo estricto de OpenAI: toda propiedad obligatoria,
 * las opcionales admiten null y no hay propiedades extra. Con el modo
 * estricto la respuesta siempre es JSON válido con esa forma.
 */
export function toOpenAiStrictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toOpenAiStrictSchema);
  if (!isNode(schema)) return schema;
  const node: SchemaNode = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!STRICT_SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" || key === "$defs" || key === "definitions") {
      node[key] = Object.fromEntries(
        Object.entries(value as SchemaNode).map(([name, definition]) => [
          name,
          toOpenAiStrictSchema(definition),
        ]),
      );
    } else if (key === "enum" || key === "const" || key === "required") {
      node[key] = value;
    } else {
      node[key] = toOpenAiStrictSchema(value);
    }
  }
  if (isNode(node.properties)) {
    const required = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );
    const properties = node.properties as Record<string, SchemaNode>;
    for (const name of Object.keys(properties)) {
      if (!required.has(name))
        properties[name] = makeNullable(properties[name]);
    }
    node.required = Object.keys(properties);
    node.additionalProperties = false;
  }
  return node;
}

/**
 * Lleva la respuesta estricta a lo que exige el esquema original: quita los
 * null que no admite (zod pone su valor por defecto) y ajusta lo que el modo
 * estricto no puede exigir: largos, topes de listas, patrones y enteros.
 */
function fitToSchema(value: unknown, schema: unknown): unknown {
  if (!isNode(schema)) return value;
  const branch = Array.isArray(schema.anyOf)
    ? (schema.anyOf.find(
        (option) => isNode(option) && option.type !== "null",
      ) ?? schema)
    : schema;
  if (!isNode(branch)) return value;
  if (typeof value === "string") {
    if (
      typeof branch.pattern === "string" &&
      !new RegExp(branch.pattern).test(value)
    ) {
      return allowsNull(schema) ? null : value;
    }
    return typeof branch.maxLength === "number"
      ? value.slice(0, branch.maxLength)
      : value;
  }
  if (typeof value === "number") {
    let number = branch.type === "integer" ? Math.round(value) : value;
    if (typeof branch.minimum === "number")
      number = Math.max(branch.minimum, number);
    if (typeof branch.maximum === "number")
      number = Math.min(branch.maximum, number);
    return number;
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => fitToSchema(item, branch.items));
    return typeof branch.maxItems === "number"
      ? items.slice(0, branch.maxItems)
      : items;
  }
  if (!isNode(value) || !isNode(branch.properties)) return value;
  const properties = branch.properties as Record<string, SchemaNode>;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const property = properties[key];
      if (item === null && property && !allowsNull(property)) return [];
      return [[key, property ? fitToSchema(item, property) : item]];
    }),
  );
}

/** Salida estricta para OpenAI; la respuesta vuelve a la forma original y se valida con el zod completo. */
export function openAiStrictOutputSchema<T extends z.ZodTypeAny>(schema: T) {
  const full = zodSchema(schema);
  return jsonSchema<z.output<T>>(
    async () => toOpenAiStrictSchema(await full.jsonSchema) as JSONSchema7,
    {
      validate: async (value) => {
        const parsed = schema.safeParse(
          fitToSchema(value, await full.jsonSchema),
        );
        return parsed.success
          ? { success: true, value: parsed.data }
          : { success: false, error: parsed.error };
      },
    },
  );
}
