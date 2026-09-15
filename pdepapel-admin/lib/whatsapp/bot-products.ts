import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Output, generateText } from "ai";
import { createHash } from "node:crypto";
import { z } from "zod";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { productTokenSearchWhere, searchTokens } from "@/lib/search-terms";
import { type FactValue } from "@/lib/whatsapp/bot-facts";

/**
 * Preguntas sobre productos por WhatsApp: si tienen algo y si queda.
 *
 * Tres piezas separadas a propósito:
 *  1. el modelo SOLO dice de qué va la pregunta y qué se busca;
 *  2. la consulta la arma este archivo contra la base de datos;
 *  3. la respuesta sale de una plantilla con esos datos.
 *
 * El modelo nunca ve un producto, ni un precio, ni —sobre todo— una cantidad
 * de existencias, porque cuando se le pregunta todavía no se ha consultado
 * nada. Y no puede redactar: lo que devuelve es un enum y dos palabras.
 *
 * Si el modelo se cae, se pasa de tiempo, se queda sin cuota o contesta algo
 * que no cuadra con el esquema, aquí no se contesta nada y el mensaje sigue su
 * camino: palabras clave y, si tampoco, a Paula. Callar no es una opción.
 */

export const PRODUCT_CLASSIFIER_TIMEOUT_MS = 2500;
export const PRODUCT_MATCH_LIMIT = 3;

export type ProductIntent = "product.search" | "product.availability";

// --- 1. Preguntarle al modelo de qué va -----------------------------------

/**
 * Dos ranuras separadas, no una frase.
 *
 * Es la raíz del problema que se midió: con «cuaderno de Stitch» como una
 * sola cadena, la búsqueda daba cero. Separado en tipo y personaje, cada
 * palabra se busca por su cuenta y aparecen los seis que sí hay.
 */
export const productClassificationSchema = z.object({
  intent: z.enum(["product.search", "product.availability", "other"]),
  productType: z.string().trim().max(40).nullable(),
  character: z.string().trim().max(40).nullable(),
});

export type ProductClassification = z.infer<typeof productClassificationSchema>;

export const PRODUCT_CLASSIFIER_PROMPT_VERSION = "productos-v1";

export const PRODUCT_CLASSIFIER_SYSTEM = `Clasificas mensajes de WhatsApp de una papelería colombiana (artículos kawaii, Sanrio, anime).
Tu única tarea es decir de qué va el mensaje y qué se busca. NUNCA redactes una respuesta para la clienta.

intent:
- "product.search": pregunta si tienen algo ("¿tienen algo de Kuromi?", "manejan stickers?")
- "product.availability": pregunta si queda o está disponible ("¿queda la cartuchera de capibara?")
- "other": cualquier otra cosa, incluido saludar, dar las gracias, precios, materiales o quejas.

productType: el tipo de artículo en singular (cuaderno, agenda, llavero, sticker...), o null si no lo dice.
character: el personaje, marca o franquicia (Stitch, Hello Kitty, Sanrio...), o null si no lo dice.

Si dudas, responde "other".`;

/** Qué pasó al clasificar; el motivo importa para saber por qué no se contestó. */
export type ClassifyOutcome =
  | { ok: true; value: ProductClassification }
  | { ok: false; reason: "not_configured" | "timeout" | "quota" | "invalid" | "error" };

/** La cuota agotada es un caso normal aquí, no una avería: se mira aparte. */
function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(message);
}

function isAbortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timeout|timed out/i.test(message);
}

export async function classifyProductQuestion(
  body: string,
): Promise<ClassifyOutcome> {
  if (!env.GEMINI_API_KEY) return { ok: false, reason: "not_configured" };

  try {
    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    const result = await generateText({
      model: google("gemini-3.5-flash-lite"),
      output: Output.object({ schema: productClassificationSchema }),
      system: PRODUCT_CLASSIFIER_SYSTEM,
      prompt: body,
      // Reintentar dentro de dos segundos y medio no sirve, y con la cuota
      // apretada cada intento cuenta: se prueba una vez y si no, se sigue.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(PRODUCT_CLASSIFIER_TIMEOUT_MS),
    });

    const parsed = productClassificationSchema.safeParse(result.output);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    return { ok: true, value: parsed.data };
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, reason: "quota" };
    if (isAbortError(error)) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "error" };
  }
}

/**
 * ¿Vale la pena preguntarle al modelo?
 *
 * La llave de Gemini es gratuita, la comparten tres pantallas del panel y se
 * queda sin cuota en cuanto llegan varios mensajes seguidos (medido: 8 de 40
 * llamadas seguidas fallaron). Un «gracias!!» no debería gastar una de esas.
 *
 * Deliberadamente generosa: ante la duda deja pasar y que decida el modelo.
 * Quedarse corta no rompe nada —el mensaje sigue a las palabras clave y de
 * ahí a Paula— pero pasarse gasta cuota que le hace falta a quien sí pregunta.
 */
const PRODUCT_SIGNALS = [
  "tiene", "tienen", "tienes", "maneja", "manejan", "hay ", "queda", "quedan",
  "disponible", "busco", "buscaba", "necesito", "quiero", "vende", "venden",
  "consigo", "algo de", "algun", "alguna", "cuentan con", "les queda",
];

export function looksLikeProductQuestion(body: string): boolean {
  const text = body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return PRODUCT_SIGNALS.some((signal) => text.includes(signal));
}

// --- 2. Buscar de verdad ---------------------------------------------------

export interface ProductMatch {
  name: string;
  price: number;
}

export interface AvailabilityMatch {
  name: string;
  inStock: boolean;
}

export interface SearchResult<T> {
  matches: T[];
  total: number;
  hasMore: boolean;
}

/** Lo que se busca, armado con lo que dijo el modelo. */
export function buildSearchQuery(c: ProductClassification): string {
  return [c.productType, c.character].filter(Boolean).join(" ").trim();
}

/**
 * `select` cerrado a propósito. `stock` entra aquí y no sale: lo que se
 * devuelve es un booleano. Ninguna plantilla, ni quien llame, ve el número.
 */
const MATCH_SELECT = {
  id: true,
  name: true,
  price: true,
  stock: true,
} as const;

async function runSearch(storeId: string, query: string) {
  const tokens = productTokenSearchWhere(query);
  if (tokens.length === 0) return null;

  const where = { storeId, isArchived: false, AND: tokens };
  const [rows, total] = await Promise.all([
    prismadb.product.findMany({
      where,
      select: MATCH_SELECT,
      // El buscador de la tienda ordena por relevancia calculada en SQL, que
      // aquí no aplica. Lo más vendido primero es lo que más suele servir.
      orderBy: [{ soldCount: "desc" }, { createdAt: "desc" }],
      take: PRODUCT_MATCH_LIMIT,
    }),
    prismadb.product.count({ where }),
  ]);
  return { rows, total };
}

export async function resolveProductSearch(
  storeId: string,
  classification: ProductClassification,
): Promise<FactValue<SearchResult<ProductMatch>>> {
  const found = await runSearch(storeId, buildSearchQuery(classification));
  // Sin nada que buscar no se sabe. Cero resultados SÍ se sabe: es «no lo tengo».
  if (!found) return { known: false };
  return {
    known: true,
    value: {
      matches: found.rows.map((p) => ({ name: p.name, price: p.price })),
      total: found.total,
      hasMore: found.total > PRODUCT_MATCH_LIMIT,
    },
  };
}

export async function resolveAvailability(
  storeId: string,
  classification: ProductClassification,
): Promise<FactValue<SearchResult<AvailabilityMatch>>> {
  const found = await runSearch(storeId, buildSearchQuery(classification));
  if (!found) return { known: false };
  return {
    known: true,
    value: {
      // Aquí muere `stock`: de este map sale un sí o un no, nunca un número.
      matches: found.rows.map((p) => ({ name: p.name, inStock: p.stock > 0 })),
      total: found.total,
      hasMore: found.total > PRODUCT_MATCH_LIMIT,
    },
  };
}

// --- 3. Los textos ---------------------------------------------------------

export function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

const linea = (name: string, detalle: string) => `• ${name} — ${detalle}`;

/**
 * Mismo tono que los acuses y que los datos del negocio: cercano, corto y
 * ofreciendo, nunca empujando. Cambiar cualquiera de estos textos cambia
 * `PRODUCT_TEMPLATES_VERSION` y retira el visto bueno de Paula.
 */
export const PRODUCT_TEMPLATES = {
  "search.none": () =>
    `Ay, eso no lo tengo por ahora 💛 Si quieres dime qué buscabas y te aviso apenas llegue.`,
  "search.one": (name: string, price: string) =>
    `Sí 💛 Tengo ${name} en ${price}. ¿Te lo aparto?`,
  "search.few": (lineas: string) =>
    `Sí, mira 💛 Tengo estos:\n${lineas}\n¿Cuál te interesa?`,
  "search.many": (lineas: string, resto: number) =>
    `Sí, tengo varios 💛 Estos son los que más salen:\n${lineas}\n…y ${resto} más. Dime cuál te interesa y te cuento.`,
  "availability.none": () =>
    `Ay, eso no lo tengo por ahora 💛 Dime qué buscabas y te aviso apenas llegue.`,
  "availability.one.yes": (name: string) =>
    `¡Sí! Tengo ${name} disponible 💛 ¿Te lo aparto?`,
  "availability.one.no": (name: string) =>
    `${name} se me agotó por ahora 💛 Si quieres te aviso apenas vuelva a entrar.`,
  "availability.few": (lineas: string) =>
    `Tengo estos 💛\n${lineas}\n¿Cuál te interesa?`,
  "availability.many": (lineas: string, resto: number) =>
    `Tengo varios 💛\n${lineas}\n…y ${resto} más. Dime cuál te interesa.`,
} as const;

export const PRODUCT_TEMPLATES_VERSION = createHash("sha256")
  .update(
    Object.entries(PRODUCT_TEMPLATES)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, render]) =>
          `${key}:${(render as (...args: never[]) => string)(
            "«»" as never,
            0 as never,
          )}`,
      )
      .join("\n"),
  )
  .digest("hex")
  .slice(0, 32);

/**
 * Los textos con un ejemplo, para que Paula los lea antes de aprobarlos.
 *
 * Aquí sí son inventados y se dice: lo que conteste el bot depende de lo que
 * pregunten y de lo que haya en el catálogo en ese momento, así que no hay un
 * «dato real» que enseñar como en los datos del negocio.
 */
export function previewProductTemplates(): { label: string; text: string }[] {
  const uno: SearchResult<ProductMatch> = {
    matches: [{ name: "Cuaderno argollado Stitch", price: 18000 }],
    total: 1,
    hasMore: false,
  };
  const varios: SearchResult<ProductMatch> = {
    matches: [
      { name: "Cuaderno argollado Stitch", price: 18000 },
      { name: "Libreta Stitch", price: 12000 },
      { name: "Llavero Stitch", price: 9000 },
    ],
    total: 3,
    hasMore: false,
  };
  const muchos: SearchResult<ProductMatch> = { ...varios, total: 6, hasMore: true };
  const sinNada: SearchResult<ProductMatch> = { matches: [], total: 0, hasMore: false };

  const dispUno = (inStock: boolean): SearchResult<AvailabilityMatch> => ({
    matches: [{ name: "Cartuchera Capibara", inStock }],
    total: 1,
    hasMore: false,
  });
  const dispVarios: SearchResult<AvailabilityMatch> = {
    matches: [
      { name: "Cartuchera Capibara", inStock: true },
      { name: "Cartuchera Capibara grande", inStock: false },
    ],
    total: 2,
    hasMore: false,
  };

  return [
    { label: "Busca algo y hay uno solo", text: renderProductSearch(uno) },
    { label: "Busca algo y hay varios", text: renderProductSearch(varios) },
    { label: "Busca algo y hay muchos", text: renderProductSearch(muchos) },
    { label: "Busca algo que no tenemos", text: renderProductSearch(sinNada) },
    { label: "Pregunta si queda y sí", text: renderAvailability(dispUno(true)) },
    { label: "Pregunta si queda y se agotó", text: renderAvailability(dispUno(false)) },
    { label: "Pregunta si queda y hay varios", text: renderAvailability(dispVarios) },
  ];
}

export function areProductAnswersApproved(s: {
  botProductsApprovedAt: Date | null;
  botProductsVersion: string | null;
}): boolean {
  return (
    s.botProductsApprovedAt !== null &&
    s.botProductsVersion === PRODUCT_TEMPLATES_VERSION
  );
}

export function renderProductSearch(result: SearchResult<ProductMatch>): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.none"]();
  if (result.total === 1) {
    return t["search.one"](result.matches[0].name, formatCOP(result.matches[0].price));
  }
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["search.many"](lineas, result.total - result.matches.length)
    : t["search.few"](lineas);
}

export function renderAvailability(
  result: SearchResult<AvailabilityMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["availability.none"]();
  if (result.total === 1) {
    const only = result.matches[0];
    return only.inStock
      ? t["availability.one.yes"](only.name)
      : t["availability.one.no"](only.name);
  }
  const lineas = result.matches
    .map((m) => linea(m.name, m.inStock ? "disponible" : "agotado por ahora"))
    .join("\n");
  return result.hasMore
    ? t["availability.many"](lineas, result.total - result.matches.length)
    : t["availability.few"](lineas);
}

// --- Unir las tres piezas --------------------------------------------------

export interface ProductAnswer {
  intent: ProductIntent;
  text: string;
}

/**
 * La respuesta sobre productos, o `null` si aquí no hay nada que contestar:
 * el mensaje no iba de esto, el modelo no pudo, o no se entendió qué buscaba.
 * Un `null` nunca es el final del camino, solo significa «que siga».
 */
export async function answerProductQuestion(
  storeId: string,
  body: string,
): Promise<ProductAnswer | null> {
  if (!looksLikeProductQuestion(body)) return null;

  const classified = await classifyProductQuestion(body);
  if (!classified.ok) {
    // Sin cuota es lo esperable en horas punta, no una avería: se anota flojito
    // y el mensaje sigue. Lo demás sí merece mirarse.
    const log = classified.reason === "quota" ? console.warn : console.error;
    log("[WHATSAPP_BOT] no se pudo clasificar la pregunta de producto", {
      storeId,
      reason: classified.reason,
    });
    return null;
  }

  const c = classified.value;
  if (c.intent === "other") return null;
  // Sin tipo ni personaje no hay nada que buscar.
  if (!buildSearchQuery(c) || searchTokens(buildSearchQuery(c)).length === 0) {
    return null;
  }

  if (c.intent === "product.availability") {
    const fact = await resolveAvailability(storeId, c);
    if (!fact.known) return null;
    return { intent: c.intent, text: renderAvailability(fact.value) };
  }

  const fact = await resolveProductSearch(storeId, c);
  if (!fact.known) return null;
  return { intent: c.intent, text: renderProductSearch(fact.value) };
}
