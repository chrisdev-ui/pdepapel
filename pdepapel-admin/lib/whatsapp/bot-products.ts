import { availableStock } from "@/lib/available-stock";
import { availableStockWhere } from "@/lib/available-stock-where";
import { logModelUsage } from "@/lib/ai-usage";
import { createHash } from "node:crypto";
import { z } from "zod";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { priceLines } from "@/lib/product-pricing";
import { getCloudinaryImageUrl } from "@/lib/cloudinary-image-loader";
import {
  formCondition,
  nameForms,
  productNameTokenSearchWhere,
  productTokenSearchWhere,
  searchTokens,
  wordForms,
} from "@/lib/search-terms";
import { type FactValue } from "@/lib/whatsapp/bot-facts";
import {
  type CatalogTermIndex,
  type ParsedSearchIntent,
  type PriceIntent,
  type ProductNoMatchReason,
  categoryUrl,
  closestCategory,
  isKnownTerm,
  loadCatalogTermIndex,
  looksLikeCatalogQuery,
  parsePriceIntent,
  parseSearchIntent,
  relatedTerms,
  storeSearchUrl,
  stripPriceWords,
  taxonomyCategoryIds,
} from "@/lib/whatsapp/search-intent";
import {
  TALK_TO_OWNER_BUTTON_ID,
  TALK_TO_OWNER_BUTTON_TITLE,
  buildProductRowId,
} from "@/lib/whatsapp/bot-replies";
import {
  WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
  WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH,
  type WhatsAppListRow,
} from "@/lib/whatsapp/send";
import { createAiProviders, getAiRoutingStore } from "@/lib/ai-model-providers";
import { classifyModelError, runStructured } from "@/lib/ai-provider";
import type { Prisma } from "@prisma/client";

export type { ProductNoMatchReason } from "@/lib/whatsapp/search-intent";

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

/** Medido: el modelo tarda de 8 a 30 s. El techo son los ~25 s que Meta
 * mantiene el «escribiendo…», y hay que caber dentro con la respuesta. */
export const PRODUCT_CLASSIFIER_TIMEOUT_MS = 20000;

/** A partir de aquí la espera se nota y se avisa. */
export const PRODUCT_CLASSIFIER_SLOW_NOTICE_MS = 3500;

/**
 * Una sola palabra —«útiles», «papel»— describe un estante entero. Salvo que
 * sea un tipo o una categoría del catálogo («marcadores», «resaltadores»):
 * ahí la lista ES la respuesta.
 */
export const MIN_SEARCH_TOKENS = 2;
/** Meta admite diez filas; la décima es la de Paula. */
export const PRODUCT_MATCH_LIMIT = 9;

export type ProductIntent =
  | "product.search"
  | "product.availability"
  | "product.price"
  | "product.features"
  | "product.photo";

/** Descripción más corta que esto no da para una respuesta: se pasa a Paula. */
export const MIN_USEFUL_DESCRIPTION_LENGTH = 40;

// --- 1. Preguntarle al modelo de qué va -----------------------------------

/**
 * Dos ranuras separadas, no una frase.
 *
 * Es la raíz del problema que se midió: con «cuaderno de Stitch» como una
 * sola cadena, la búsqueda daba cero. Separado en tipo y personaje, cada
 * palabra se busca por su cuenta y aparecen los seis que sí hay.
 */
export const productClassificationSchema = z.object({
  intent: z.enum([
    "product.search",
    "product.availability",
    "product.price",
    "product.features",
    "product.photo",
    "other",
  ]),
  // `nullish` y no `nullable`: si el modelo se deja una ranura sin poner, se
  // trata como vacía en vez de tirar una clasificación que por lo demás era
  // buena. Perder un matiz es mucho mejor que perder la respuesta entera.
  productType: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v ?? null),
  character: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v ?? null),
  /**
   * Lo que distingue a un producto de otro igual: color, tamaño, material,
   * estampado. Sin esta ranura, «muéstrame el morado pastel» se quedaba sin
   * NADA que buscar —ni tipo ni personaje— y la compra moría ahí, aunque
   * «morado pastel» encuentre ese cuaderno y solo ese.
   */
  descriptor: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => v ?? null),
});

export type ProductClassification = z.infer<typeof productClassificationSchema>;

export const PRODUCT_CLASSIFIER_PROMPT_VERSION = "productos-v2";

export const PRODUCT_CLASSIFIER_SYSTEM = `Clasificas mensajes de WhatsApp de una papelería colombiana (artículos kawaii, Sanrio, anime).
Tu única tarea es decir de qué va el mensaje y qué se busca.

intent:
- "product.search": pregunta si tienen algo ("¿tienen algo de Kuromi?", "manejan stickers?"), o solo nombra un artículo ("marcadores baratos", "resaltadores")
- "product.availability": pregunta si queda o está disponible ("¿queda la cartuchera de capibara?")
- "product.price": pregunta cuánto cuesta ("¿cuánto vale el cuaderno de Stitch?")
- "product.features": pregunta cómo es el producto: material, tamaño, qué trae, cuántas hojas
- "product.photo": pide ver el producto ("mándame una foto del cuaderno", "cómo se ve?")
- "other": cualquier otra cosa, incluido saludar, dar las gracias, envíos, horarios o quejas.

productType: el tipo de artículo en singular (cuaderno, agenda, llavero, sticker...), o null si no lo dice.
character: el personaje, marca o franquicia (Stitch, Hello Kitty, Sanrio...), o null si no lo dice.
descriptor: lo que distingue ese producto de otro igual —color, tamaño, material, estampado—
  tal como lo dijo la clienta y con todas sus palabras ("morado pastel", "grande", "de tela",
  "de rayas"). null si no lo dice. Importante: si menciona un color o un tamaño, va SIEMPRE aquí,
  aunque no diga de qué artículo habla.
Las palabras de precio ("barato", "económico", "menos de 10 mil") no van en ninguna ranura.

Si dudas, responde "other".`;

/** Qué pasó al clasificar; el motivo importa para saber por qué no se contestó. */
export type ClassifyOutcome =
  | { ok: true; value: ProductClassification }
  | {
      ok: false;
      reason: "not_configured" | "timeout" | "quota" | "invalid" | "error";
    };

/** La cuota agotada (o el tope de gasto) es un caso normal aquí, no una avería: se mira aparte. */
function isQuotaError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AiBusyError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(message);
}

function isAbortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timeout|timed out/i.test(message);
}

/**
 * Los mensajes de clientas van solo a OpenAI (de pago, no entrena con datos de
 * la API): nunca a un proveedor gratuito. Si OpenAI falla, el bot sigue con
 * las palabras clave.
 */
export async function classifyProductQuestion(
  body: string,
): Promise<ClassifyOutcome> {
  const { openai } = createAiProviders({ openai: env.OPENAI_API_KEY });
  if (!openai) return { ok: false, reason: "not_configured" };

  try {
    const result = await runStructured({
      feature: "whatsapp.classifier",
      schema: productClassificationSchema,
      system: PRODUCT_CLASSIFIER_SYSTEM,
      prompt: body,
      primary: openai,
      fallback: null,
      store: getAiRoutingStore(),
      timeoutMs: PRODUCT_CLASSIFIER_TIMEOUT_MS,
    });
    logModelUsage("whatsapp.classifier", result.usage);
    return { ok: true, value: result.output };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, reason: "invalid" };
    if (isQuotaError(error)) return { ok: false, reason: "quota" };
    if (isAbortError(error) || classifyModelError(error).kind === "timeout") {
      return { ok: false, reason: "timeout" };
    }
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
const SEARCH_SIGNALS = [
  "tiene",
  "tienen",
  "tienes",
  "maneja",
  "manejan",
  "hay ",
  "busco",
  "buscaba",
  "necesito",
  "quiero",
  "vende",
  "venden",
  "consigo",
  "algo de",
  "algun",
  "alguna",
  "cuentan con",
];

const AVAILABILITY_SIGNALS = ["queda", "quedan", "disponible", "les queda"];

const PRICE_SIGNALS = [
  "cuanto",
  "precio",
  "vale",
  "cuesta",
  "valen",
  "cuestan",
];

/** Cómo es y enséñamelo: sin el modelo no se sabe de cuál, así que siempre pasan por él. */
const DETAIL_SIGNALS = [
  "material",
  "tamano",
  "medida",
  "que trae",
  "que incluye",
  "de que esta",
  "cuantas hojas",
  "cuantos",
  "como es",
  "caracteristica",
  // Enséñamelo.
  "foto",
  "fotos",
  "imagen",
  "imagenes",
  "como se ve",
  "ver el",
  "ver la",
  // El plural no estaba y «¿puedo ver los acrílicos?» se caía aquí, antes de
  // llegar a nada: el portero solo conocía «ver el» y «ver la».
  "ver los",
  "ver las",
  "dejas ver",
  "dejame ver",
  "puedo ver",
  "muestrame",
  "mandame",
  "manda una",
  "enviame",
];

const PRODUCT_SIGNALS = [
  ...SEARCH_SIGNALS,
  ...AVAILABILITY_SIGNALS,
  ...PRICE_SIGNALS,
  ...DETAIL_SIGNALS,
];

const sinTildes = (body: string) =>
  body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const conSenal = (text: string, signals: string[]) =>
  signals.some((signal) => matchesSignal(text, signal));

/**
 * Solo las señales de pregunta, sin mirar el catálogo. Es la versión que no
 * consulta nada; `looksLikeProductQuestionForStore` es la completa.
 */
export function looksLikeProductQuestion(body: string): boolean {
  return conSenal(sinTildes(body), PRODUCT_SIGNALS);
}

export interface ProductQuestionGate {
  pass: boolean;
  parsed: ParsedSearchIntent;
  index: CatalogTermIndex;
}

/**
 * El portero completo: una señal de pregunta, o un mensaje corto que nombra
 * algo del catálogo («marcadores baratos», «resaltadores»). Los términos se
 * leen una vez cada pocos minutos por tienda, no por mensaje.
 */
export async function productQuestionGate(
  storeId: string,
  body: string,
): Promise<ProductQuestionGate> {
  const index = await loadCatalogTermIndex(storeId);
  const parsed = parseSearchIntent(body, index);
  return {
    pass: looksLikeProductQuestion(body) || looksLikeCatalogQuery(parsed),
    parsed,
    index,
  };
}

export async function looksLikeProductQuestionForStore(
  storeId: string,
  body: string,
): Promise<boolean> {
  return (await productQuestionGate(storeId, body)).pass;
}

/**
 * La intención cuando se puede saber sin el modelo: todas las palabras que
 * quedan son del catálogo y no pide detalles ni fotos de uno en concreto.
 * «marcadores baratos», «¿tienen resaltadores?», «cuánto valen los colores».
 * Ahorra los 8 a 30 s del clasificador y su cuota, y no depende de que el
 * modelo no conteste «other» a algo que no trae verbo.
 */
export function intentWithoutModel(
  body: string,
  parsed: ParsedSearchIntent,
): ProductIntent | null {
  if (!parsed.allKnown || parsed.conversational) return null;
  const text = sinTildes(parsePriceIntent(body).rest);
  if (conSenal(text, DETAIL_SIGNALS)) return null;
  if (conSenal(text, PRICE_SIGNALS)) return "product.price";
  if (conSenal(text, AVAILABILITY_SIGNALS)) return "product.availability";
  return "product.search";
}

/**
 * Por palabras enteras, no por trozos.
 *
 * Buscar «como es» dentro del texto tal cual encontraba «como estas», y un
 * «hola vecina como estas» acababa en el buscador de productos. Pasaba con
 * tres saludos de conversaciones reales. Exigir que la señal termine donde
 * termina una palabra lo arregla sin tocar la lista.
 */
function matchesSignal(text: string, signal: string): boolean {
  // Algunas señales ya traen su propio final, como «hay »: ahí el espacio ya
  // hizo de frontera. El comienzo también cuenta: «tienen» no vale dentro de «mantienen».
  const checkStart = /^[a-z0-9]/.test(signal);
  const checkEnd = /[a-z0-9]$/.test(signal);
  for (let i = text.indexOf(signal); i !== -1; i = text.indexOf(signal, i + 1)) {
    const anterior = text[i - 1];
    const siguiente = text[i + signal.length];
    const startOk = !checkStart || anterior === undefined || !/[a-z0-9]/.test(anterior);
    const endOk = !checkEnd || siguiente === undefined || !/[a-z0-9]/.test(siguiente);
    if (startOk && endOk) return true;
  }
  return false;
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
  /**
   * Los ids de `matches`, en el mismo orden. Se guardan con el mensaje para
   * poder resolver luego un «el primero». Nunca se enseñan.
   */
  ids?: string[];
  /**
   * La foto, solo cuando hay UN único producto: con una lista no se puede
   * elegir cuál enseñar, y tres fotos seguidas serían un muro.
   */
  photo?: string | null;
}

/** Lo que se busca, armado con lo que dijo el modelo. */
export function buildSearchQuery(c: ProductClassification): string {
  return [c.productType, c.character, c.descriptor]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Cuando el modelo no supo separar nada, se busca el mensaje tal cual.
 *
 * Es la red por debajo de las tres ranuras: aunque no encajen —hoy el color
 * encaja, mañana será otra cosa—, las palabras de la clienta siguen ahí. Se
 * quitan las de cortesía y las de unión (`searchTokens`) y se busca con lo que
 * queda: de «muéstrame el morado pastel» sobra «morado pastel», que encuentra
 * ese cuaderno y solo ese.
 *
 * Devuelve cadena vacía cuando no queda nada útil, y entonces sí se escala.
 */
export function fallbackQueryFromMessage(body: string): string {
  return searchTokens(body).join(" ");
}

/**
 * `select` cerrado a propósito. `stock` entra aquí y no sale: lo que se
 * devuelve es un booleano. Ninguna plantilla, ni quien llame, ve el número.
 * Categoría y grupo solo sirven para encontrar las ofertas vigentes.
 */
const MATCH_SELECT = {
  id: true,
  name: true,
  price: true,
  stock: true,
  reservedUnits: true,
  categoryId: true,
  productGroupId: true,
} as const;

interface PricedRow {
  id: string;
  price: number;
  categoryId: string;
  productGroupId: string | null;
}

/**
 * Lo que cobra la tienda por unidad a esa cantidad: precio de lista, la mejor
 * oferta vigente o la escalera por cantidad, con el mismo cálculo del checkout
 * (`priceLines`), y al peso, como lo escribe `formatCOP`. Si el cálculo falla
 * se cotiza el precio de lista antes que dejar a la clienta sin respuesta.
 */
export async function effectiveUnitPrices(storeId: string, rows: PricedRow[], quantity = 1): Promise<Map<string, number>> {
  const result = new Map(rows.map((row) => [row.id, Math.round(row.price)]));
  if (rows.length === 0) return result;
  try {
    const priced = await priceLines(storeId, rows.map((row) => ({ productId: row.id, quantity })), rows);
    priced.forEach((line, id) => result.set(id, Math.round(line.unitPrice)));
  } catch (error) {
    console.warn("[WHATSAPP_BOT] No se pudo calcular el precio con ofertas; se usa el de lista", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return result;
}

/**
 * Primero por nombre; a la descripción solo si el nombre no da nada.
 *
 * Mirar también las descripciones ensucia la lista: un color mencionado de
 * pasada en otro producto lo cuela. Medido contra el catálogo real,
 * «borrador morado» pasaba de 6 productos a 1, y «cuaderno azul pastel» de 12
 * a 3, sin perder ninguno de los buenos.
 *
 * Pero a veces la palabra SOLO vive en la descripción —«agenda grande» no
 * encuentra nada por nombre y sí dos por descripción—, así que ahí se amplía.
 * El orden importa: ampliar solo puede añadir productos, nunca quitarlos, así
 * que se hace cuando falta algo, no cuando sobra.
 */
interface SearchOptions {
  withDescription?: boolean;
  /** Con intención de precio: solo lo que hay para vender, lo más económico primero. */
  price?: PriceIntent | null;
}

async function runSearch(
  storeId: string,
  query: string,
  options: SearchOptions = {},
) {
  // En caché unos minutos por tienda: no suma una consulta por mensaje.
  const index = await loadCatalogTermIndex(storeId);
  const porNombre = botTokenWhere(query, false, index);
  if (porNombre.length === 0) return null;
  const seccion = options.price ? seccionExacta(index, query) : null;
  const buscar = (tokens: Prisma.ProductWhereInput[]) =>
    seccion ? buscarPorNiveles(storeId, tokens, seccion, options) : buscarCon(storeId, tokens, options);

  const primera = await buscar(porNombre);
  if (primera.total > 0) return primera;

  // El nombre no encontró nada: puede que la palabra esté en la descripción.
  return buscar(botTokenWhere(query, true, index));
}

/** Las categorías de la primera palabra que nombra EXACTAMENTE un tipo o una categoría. */
function seccionExacta(index: CatalogTermIndex, query: string): string[] | null {
  for (const token of searchTokens(query)) {
    const t = taxonomyCategoryIds(index, token);
    if (t?.exact) return t.ids;
  }
  return null;
}

/**
 * Con precio y una sección exacta, dos niveles que no se mezclan: primero lo
 * que ES de esa sección (los marcadores de «Marcadores»), del más económico
 * al más caro; después la familia de fuera (micropuntas, resaltadores), igual
 * ordenada. Si no, una micropunta de $1.500 tapaba a los marcadores de
 * verdad. El total cuenta los dos, en ese orden.
 */
async function buscarPorNiveles(
  storeId: string,
  tokens: Prisma.ProductWhereInput[],
  categoryIds: string[],
  options: SearchOptions,
) {
  const [dentro, fuera] = await Promise.all([
    buscarCon(storeId, [...tokens, { categoryId: { in: categoryIds } }], options),
    buscarCon(storeId, [...tokens, { categoryId: { notIn: categoryIds } }], options),
  ]);
  return {
    rows: [...dentro.rows, ...fuera.rows].slice(0, PRODUCT_MATCH_LIMIT),
    total: dentro.total + fuera.total,
  };
}

/**
 * Las condiciones de cada palabra, más su familia de WhatsApp: «marcadores»
 * también trae resaltadores y micropuntas (ver `relatedTerms`). Sin familia
 * es exactamente la condición de `search-terms`.
 */
function botTokenWhere(
  query: string,
  withDescription: boolean,
  index: CatalogTermIndex,
): Prisma.ProductWhereInput[] {
  const base = withDescription ? productTokenSearchWhere : productNameTokenSearchWhere;
  return searchTokens(query).flatMap((token) => {
    const taxonomia = taxonomyCategoryIds(index, token);
    if (taxonomia) return [taxonomyTokenWhere(token, taxonomia, withDescription)];
    const [propia] = token.toLocaleLowerCase("es-CO") === "colores" ? [COLORES_WHERE] : base(token);
    if (!propia) return [];
    const familia = relatedTerms(token)
      .map((term) => base(term))
      .filter((conds) => conds.length > 0)
      .map((conds) => (conds.length === 1 ? conds[0] : { AND: conds }));
    return [familia.length > 0 ? { OR: [propia, ...familia] } : propia];
  });
}

/**
 * La palabra nombra un tipo o una categoría de la tienda: manda la taxonomía.
 *
 * Con igualdad exacta («cuadernos» = tipo «Cuadernos», «colores» = categoría
 * «Colores») entran esas categorías y, de fuera, solo lo que lleva en el
 * nombre una palabra de su familia de WhatsApp (los resaltadores y las
 * micropuntas de «marcadores»). Ni la palabra misma ni sus sinónimos se
 * buscan en el nombre: en producción «colores» traía almohadillas «de
 * colores» y plastilina, y «cuadernos», por el sinónimo «block», blocks de
 * origami y antes el foami de «Blocks de papel».
 *
 * Si solo hay categorías que EMPIEZAN por la palabra («Cuadernos de
 * lettering»), se suman a lo de siempre en el nombre, con sinónimos.
 */
function taxonomyTokenWhere(
  token: string,
  taxonomia: { ids: string[]; exact: boolean },
  withDescription: boolean,
): Prisma.ProductWhereInput {
  const colores = token.toLocaleLowerCase("es-CO") === "colores";
  const enNombre = (palabra: string): Prisma.ProductWhereInput =>
    palabra.toLocaleLowerCase("es-CO") === "colores"
      ? { name: { contains: "colores" } }
      : { OR: nameForms(palabra).map((f) => formCondition("name", f) as Prisma.ProductWhereInput) };
  const familia = relatedTerms(token).map((term) => {
    const partes = searchTokens(term).map(enNombre);
    return partes.length === 1 ? partes[0] : { AND: partes };
  });
  const enCategorias: Prisma.ProductWhereInput = { categoryId: { in: taxonomia.ids } };
  if (taxonomia.exact) return { OR: [enCategorias, ...familia] };
  return {
    OR: [
      enCategorias,
      enNombre(token),
      ...familia,
      ...(withDescription && !colores
        ? wordForms(token).map((f) => formCondition("description", f) as Prisma.ProductWhereInput)
        : []),
    ],
  };
}

/**
 * «colores» a secas son colores para pintar. Con la condición de siempre,
 * «color» encontraba todo lo que tiene el color «Multicolor» en la ficha y
 * cualquier «multicolor» en el nombre. Ni la descripción entra: «viene en
 * varios colores» lo dicen muchas.
 */
const COLORES_WHERE: Prisma.ProductWhereInput = {
  OR: [
    { name: { contains: "colores" } },
    { category: { is: { name: { contains: "colores" } } } },
    { productGroup: { is: { name: { contains: "colores" } } } },
  ],
};

/**
 * Con intención de precio se piden más candidatos de los que se enseñan: se
 * ordenan por precio de lista en la base y luego por el precio que de verdad
 * se cobra (con ofertas). Un producto con lista por encima del tope y oferta
 * por debajo no entra; es el precio con que se filtra en la base.
 */
const PRICE_CANDIDATES = 30;

async function buscarCon(
  storeId: string,
  tokens: Prisma.ProductWhereInput[],
  options: SearchOptions,
) {
  const price = options.price ?? null;
  const where: Prisma.ProductWhereInput = {
    storeId,
    isArchived: false,
    AND: tokens,
    ...(price ? availableStockWhere() : {}),
    ...(price?.maxPrice ? { price: { lte: price.maxPrice } } : {}),
  };
  const [rows, total] = (await Promise.all([
    prismadb.product.findMany({
      where,
      // `description` solo se pide cuando preguntan cómo es el producto. La
      // foto se pide SIEMPRE: cualquier respuesta de un solo producto la lleva.
      select: {
        ...MATCH_SELECT,
        ...(options.withDescription ? { description: true } : {}),
        images: {
          // La marcada como principal manda; las rotas (las marca el cron
          // diario) ni se miran. Es el mismo criterio que usa la tienda.
          where: { brokenAt: null },
          orderBy: { isMain: "desc" as const },
          select: { url: true },
          take: 1,
        },
      },
      // El buscador de la tienda ordena por relevancia calculada en SQL, que
      // aquí no aplica. Lo más vendido primero es lo que más suele servir,
      // salvo que haya pedido lo barato.
      orderBy: price
        ? [{ price: "asc" as const }, { soldCount: "desc" as const }]
        : [{ soldCount: "desc" as const }, { createdAt: "desc" as const }],
      take: price ? PRICE_CANDIDATES : PRODUCT_MATCH_LIMIT,
    }),
    prismadb.product.count({ where }),
  ])) as [
    {
      id: string;
      name: string;
      price: number;
      stock: number;
      reservedUnits: number;
      categoryId: string;
      productGroupId: string | null;
      description?: string | null;
      images: { url: string }[];
    }[],
    number,
  ];
  const prices = await effectiveUnitPrices(storeId, rows);
  const conPrecio = rows.map((row) => ({ ...row, price: prices.get(row.id) ?? row.price }));
  if (!price) return { rows: conPrecio, total };
  const ordenados = conPrecio
    .filter((row) => availableStock(row) > 0)
    .map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.price - b.row.price || a.i - b.i)
    .map(({ row }) => row);
  return { rows: ordenados.slice(0, PRODUCT_MATCH_LIMIT), total };
}

/** El ancho que ya usan la tienda y el panel; pedir otro crearía copias nuevas. */
export const PHOTO_WIDTH = 1600;

/**
 * La foto que se manda de un producto, ya lista para WhatsApp.
 *
 * `null` no es un fallo: son los ~9 productos de 845 sin ninguna utilizable
 * (todas rotas, o solo webp). La respuesta sale igual, sin foto.
 *
 * Pasa por la transformación de siempre, que además de no crear copias nuevas
 * en Cloudinary devuelve JPEG, lo único —con PNG— que Meta acepta.
 */
export function pickPhoto(
  images: { url: string }[] | undefined,
): string | null {
  const url = images?.[0]?.url;
  if (!url) return null;
  const listo = getCloudinaryImageUrl(url, PHOTO_WIDTH);
  return listo.trim() ? listo : null;
}

export async function resolveProductSearch(
  storeId: string,
  classification: ProductClassification,
  options: { price?: PriceIntent | null } = {},
): Promise<FactValue<SearchResult<ProductMatch>>> {
  const found = await runSearch(storeId, buildSearchQuery(classification), options);
  // Sin nada que buscar no se sabe. Cero resultados SÍ se sabe: es «no lo tengo».
  if (!found) return { known: false };
  return {
    known: true,
    value: {
      matches: found.rows.map((p) => ({ name: p.name, price: p.price })),
      ids: found.rows.map((p) => p.id),
      total: found.total,
      hasMore: found.total > PRODUCT_MATCH_LIMIT,
      photo: found.total === 1 ? pickPhoto(found.rows[0]?.images) : null,
    },
  };
}

/**
 * De HTML de Tiptap a un mensaje de WhatsApp.
 *
 * Las descripciones se escriben en el editor del panel y se guardan con
 * marcado. Medido sobre el catálogo real: `<p>`, `<strong>`, `<li>`, `<br>`,
 * `<ul>`, `<em>`, `<span>`, `<mark>` y `<h3>`, y ni una sola entidad HTML.
 *
 * Los saltos de párrafo y de línea se conservan porque separan ideas, y las
 * viñetas se vuelven «•», que es como se escribe una lista por WhatsApp. Lo
 * demás se cae: allí no hay negritas y una etiqueta suelta se leería literal.
 */
export function cleanDescription(html: string | null | undefined): string {
  if (!html) return "";
  return (
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h[1-6]|div)>/gi, "\n\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      // Por si el editor llegara a emitir entidades algún día; hoy no hay ninguna.
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Lo que cabe cómodo en un mensaje sin que parezca un volcado. */
export const DESCRIPTION_MAX_LENGTH = 600;

export function trimForWhatsApp(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text;
  const corte = text.slice(0, DESCRIPTION_MAX_LENGTH);
  // Se corta en la última frase entera para no dejarla a medias.
  const punto = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("\n"));
  return `${(punto > 200 ? corte.slice(0, punto + 1) : corte).trim()}…`;
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
      matches: found.rows.map((p) => ({ name: p.name, inStock: availableStock(p) > 0 })),
      ids: found.rows.map((p) => p.id),
      total: found.total,
      hasMore: found.total > PRODUCT_MATCH_LIMIT,
      photo: found.total === 1 ? pickPhoto(found.rows[0]?.images) : null,
    },
  };
}

export async function resolveProductPrice(
  storeId: string,
  classification: ProductClassification,
  options: { price?: PriceIntent | null } = {},
): Promise<FactValue<SearchResult<ProductMatch>>> {
  // Mismo resultado que la búsqueda: para el precio hace falta lo mismo, y la
  // lista de desambiguación ya lleva los precios, así que sirve de respuesta.
  return resolveProductSearch(storeId, classification, options);
}

export interface FeaturesMatch {
  name: string;
  description: string;
}

export async function resolveProductFeatures(
  storeId: string,
  classification: ProductClassification,
): Promise<
  FactValue<SearchResult<FeaturesMatch> | SearchResult<ProductMatch>>
> {
  const found = await runSearch(storeId, buildSearchQuery(classification), {
    withDescription: true,
  });
  if (!found) return { known: false };

  // Con varios candidatos no se puede contar de cuál: primero hay que saber
  // cuál. Se devuelven como la búsqueda, con nombre y precio, para preguntar.
  if (found.total !== 1) {
    return {
      known: true,
      value: {
        matches: found.rows.map((p) => ({ name: p.name, price: p.price })),
        ids: found.rows.map((p) => p.id),
        total: found.total,
        hasMore: found.total > PRODUCT_MATCH_LIMIT,
        photo: null,
      },
    };
  }

  const only = found.rows[0];
  const description = cleanDescription(only.description);
  // Una descripción de dos palabras se lee peor que un «déjame preguntarle a
  // Paula»: no se manda, se escala. Son ~168 de los 845 productos activos.
  if (description.length < MIN_USEFUL_DESCRIPTION_LENGTH)
    return { known: false };

  return {
    known: true,
    value: {
      matches: [{ name: only.name, description: trimForWhatsApp(description) }],
      ids: [only.id],
      total: 1,
      hasMore: false,
      photo: pickPhoto(only.images),
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
  /**
   * Cero resultados ya no es un «no lo tengo». El 30 de septiembre una clienta
   * preguntó por «los tote bag de perrito», el bot contestó que no lo tenía y
   * el producto estaba activo y con existencias: la búsqueda no lo encontró.
   * Cuando no aparece nada, lo honesto es decir que no se sabe y pasárselo a
   * Paula. Un «no» equivocado cuesta una venta; un «déjame confirmar» no.
   */
  "search.unsure": () =>
    `Esa no la tengo ubicada ahora mismo 💛 Déjame confirmarlo con Paula y ella te escribe.`,
  /**
   * Lo que pidió no está, pero el tipo sí: «tote bag de dinosaurio» no hay,
   * tote bags sí. Se dice lo que falta y se enseña lo que hay, sin fingir
   * que era lo que pedía.
   */
  "search.partial.one": (
    faltante: string,
    tipo: string,
    name: string,
    price: string,
  ) =>
    `De ${faltante} no tengo por ahora 💛 Pero de ${tipo} tengo ${name} en ${price}. ¿Te sirve?`,
  "search.partial.few": (faltante: string, tipo: string, lineas: string) =>
    `De ${faltante} no tengo por ahora 💛 Pero de ${tipo} sí, mira:\n${lineas}\n¿Te sirve alguno?`,
  "search.partial.many": (
    faltante: string,
    tipo: string,
    lineas: string,
    resto: number,
  ) =>
    `De ${faltante} no tengo por ahora 💛 Pero de ${tipo} sí, mira:\n${lineas}\n…y ${resto} más. Dime cuál te interesa.`,
  "search.one": (name: string, price: string) =>
    `Sí 💛 Tengo ${name} en ${price}. ¿Lo quieres?`,
  "search.few": (lineas: string) =>
    `Sí, mira 💛 Tengo estos:\n${lineas}\n¿Cuál te interesa?`,
  "search.many": (lineas: string, resto: number) =>
    `Sí, tengo varios 💛 Estos son los que más salen:\n${lineas}\n…y ${resto} más. Dime cuál te interesa y te cuento.`,
  /**
   * Pidió lo barato: la lista va del más económico al más caro y solo con lo
   * que hay para vender. Por eso no dice «los que más salen», que aquí sería
   * mentira, ni hay umbral de «barato»: es un orden, no una cifra.
   */
  "search.cheap.many": (lineas: string, resto: number) =>
    `Estos son los más económicos que tengo 💛\n${lineas}\n…y ${resto} más. Dime cuál te interesa y te cuento.`,
  // Dijo un tope («menos de 10 mil», «hasta 5.000»).
  "search.ceiling.few": (tope: string, lineas: string) =>
    `Hasta ${tope} tengo estos 💛\n${lineas}\n¿Cuál te interesa?`,
  "search.ceiling.many": (tope: string, lineas: string, resto: number) =>
    `Hasta ${tope}, estos son los más económicos que tengo 💛\n${lineas}\n…y ${resto} más. Dime cuál te interesa y te cuento.`,
  // Con el tope no queda nada, pero sí hay del tipo: se enseña lo más económico.
  "search.ceiling.none.one": (tope: string, name: string, price: string) =>
    `Hasta ${tope} no tengo por ahora 💛 Lo más económico que tengo es ${name} en ${price}. ¿Te sirve?`,
  "search.ceiling.none": (tope: string, lineas: string) =>
    `Hasta ${tope} no tengo por ahora 💛 Lo más económico que tengo es:\n${lineas}\n¿Te sirve alguno?`,
  /**
   * Cero resultados la primera vez: no se pasa a Paula de una. Se manda UN
   * mensaje con el enlace dentro (nunca otro aparte: ya hubo un incidente de
   * enlaces repetidos) y se le ofrece Paula, que además tiene su botón.
   * «No encontré» y no «no tengo»: la búsqueda pudo fallar (el tote bag).
   */
  "search.none.category": (busqueda: string, categoria: string, url: string) =>
    `No encontré ${busqueda} por aquí 💛 Mira lo que tengo en ${categoria}: ${url}\n¿Quieres que Paula te ayude?`,
  "search.none.store": (busqueda: string, url: string) =>
    `No encontré ${busqueda} por aquí 💛 Puedes buscarlo en la tienda: ${url}\n¿Quieres que Paula te ayude?`,
  "availability.one.yes": (name: string) =>
    `¡Sí! Tengo ${name} disponible 💛 ¿Lo quieres?`,
  "availability.one.no": (name: string) =>
    `${name} se me agotó por ahora 💛 Si quieres te aviso apenas vuelva a entrar.`,
  "availability.few": (lineas: string) =>
    `Tengo estos 💛\n${lineas}\n¿Cuál te interesa?`,
  "availability.many": (lineas: string, resto: number) =>
    `Tengo varios 💛\n${lineas}\n…y ${resto} más. Dime cuál te interesa.`,
  "price.one": (name: string, price: string) =>
    `${name} está en ${price} 💛 ¿Lo quieres?`,
  "price.few": (lineas: string) => `Mira 💛\n${lineas}\n¿Cuál te interesa?`,
  "price.many": (lineas: string, resto: number) =>
    `Tengo varios 💛\n${lineas}\n…y ${resto} más. Dime cuál y te paso el precio.`,
  "features.one": (name: string, description: string) =>
    `${name} 💛\n${description}\n¿Te cuento algo más?`,
  "features.which": (lineas: string) =>
    `¿Cuál de estos? 💛\n${lineas}\nDime cuál y te cuento cómo es.`,
  "photo.one": (name: string, price: string) =>
    `Mira 💛 ${name} — ${price}. ¿Lo quieres?`,
  "photo.none.usable": (name: string, price: string) =>
    `${name} está en ${price} 💛 No tengo foto de ese a la mano, pero le digo a Paula que te la mande.`,
  "features.which.many": (lineas: string, resto: number) =>
    `Tengo varios 💛\n${lineas}\n…y ${resto} más. Dime cuál y te cuento cómo es.`,
  // Señaló una opción de una lista que ya no está: pasaron más de diez minutos
  // o el número no existía. Se admite el despiste en vez de escalar.
  "reference.lost": () =>
    `Se me fue el hilo 💛 ¿Me dices otra vez cuál te interesa? Puedes escribir el nombre o el número de la lista.`,
  // La lista tocable. El cuerpo no repite las opciones: están en la lista, y
  // repetirlas sería el muro de texto que esto viene a quitar.
  "list.body.few": (cuantos: number) =>
    `Sí 💛 Tengo ${cuantos} que te pueden servir. Míralos y escoge el que quieras.`,
  "list.body.many": (cuantos: number, resto: number) =>
    `Sí, tengo varios 💛 Aquí van ${cuantos}, y me quedan ${resto} más. Toca el que te guste, o dime algo más preciso y te busco mejor.`,
  // La lista de lo que sí hay cuando lo pedido no está. No empieza con «Sí»:
  // a «¿tienen tote bag de dinosaurio?» la respuesta es que no.
  "list.body.partial": (faltante: string, tipo: string, cuantos: number) =>
    `De ${faltante} no tengo por ahora 💛 Pero de ${tipo} tengo ${cuantos}. Míralos y escoge el que quieras.`,
  "list.body.partial.many": (
    faltante: string,
    tipo: string,
    cuantos: number,
    resto: number,
  ) =>
    `De ${faltante} no tengo por ahora 💛 Pero de ${tipo} tengo varios: aquí van ${cuantos} y me quedan ${resto} más. Toca el que te guste.`,
  "list.body.cheap.many": (cuantos: number, resto: number) =>
    `Estos son los ${cuantos} más económicos que tengo 💛 Me quedan ${resto} más. Toca el que te guste, o dime algo más preciso y te busco mejor.`,
  "list.body.ceiling": (tope: string, cuantos: number) =>
    `Hasta ${tope} tengo ${cuantos} que te pueden servir 💛 Míralos y escoge el que quieras.`,
  "list.body.ceiling.many": (tope: string, cuantos: number, resto: number) =>
    `Hasta ${tope} tengo varios 💛 Aquí van los ${cuantos} más económicos, y me quedan ${resto} más. Toca el que te guste.`,
  "list.body.ceiling.none": (tope: string, cuantos: number) =>
    `Hasta ${tope} no tengo por ahora 💛 Estos son los ${cuantos} más económicos que sí tengo. Toca el que te guste.`,
  "list.button": () => `Ver opciones`,
  "list.section": () => `Elige uno`,
  "list.footer": () => `O escríbeme y te ayudo`,
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
  const muchos: SearchResult<ProductMatch> = {
    ...varios,
    total: 6,
    hasMore: true,
  };
  const sinNada: SearchResult<ProductMatch> = {
    matches: [],
    total: 0,
    hasMore: false,
  };
  const baratos: SearchResult<ProductMatch> = {
    matches: [
      { name: "Micropunta negra 0.4", price: 1500 },
      { name: "Resaltador pastel", price: 2500 },
      { name: "Marcador doble punta", price: 4000 },
    ],
    total: 14,
    hasMore: true,
  };

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
    {
      label:
        "Busca algo que no aparece, pero el tipo sí (p. ej. tote bag de dinosaurio)",
      text: renderPartialSearch("dinosaurio", "tote bag", {
        matches: [
          { name: 'Tote bag "Un día a la Vez"', price: 35000 },
          { name: 'Tote bag "Caribe"', price: 35000 },
        ],
        total: 2,
        hasMore: false,
      }),
    },
    {
      label: "Busca algo que no aparece por ningún lado (si Paula ya está avisada)",
      text: renderProductSearch(sinNada),
    },
    {
      label: "Busca algo que no aparece y hay una categoría parecida (p. ej. «plumones metálicos»)",
      text: renderNoResults("plumones metálicos", { name: "Marcadores", slug: "marcadores" }),
    },
    {
      label: "Busca algo que no aparece y no hay categoría parecida (p. ej. «mantel de plástico»)",
      text: renderNoResults("mantel de plástico", null),
    },
    {
      label: "Pide lo barato y hay muchos (p. ej. «marcadores baratos»)",
      text: renderCheapSearch(baratos, { sort: "cheapest", maxPrice: null }),
    },
    {
      label: "Pide lo barato y hay muchos: la lista para tocar",
      text: buildCheapListBody(3, 14, { sort: "cheapest", maxPrice: null }),
    },
    {
      label: "Dice un tope y hay pocos (p. ej. «cuadernos de menos de 10 mil»)",
      text: renderCheapSearch({ ...baratos, total: 3, hasMore: false }, { sort: "cheapest", maxPrice: 10000 }),
    },
    {
      label: "Dice un tope y hay muchos",
      text: renderCheapSearch(baratos, { sort: "cheapest", maxPrice: 10000 }),
    },
    {
      label: "Dice un tope: la lista para tocar, con pocos y con muchos",
      text: [
        buildCheapListBody(3, 3, { sort: "cheapest", maxPrice: 10000 }),
        buildCheapListBody(3, 14, { sort: "cheapest", maxPrice: 10000 }),
      ].join("\n\n"),
    },
    {
      label: "Dice un tope y no hay nada por debajo: lo más económico que sí hay",
      text: [
        renderCeilingMiss(1000, { ...baratos, matches: baratos.matches.slice(0, 1), total: 1, hasMore: false }),
        renderCeilingMiss(1000, { ...baratos, total: 3, hasMore: false }),
        PRODUCT_TEMPLATES["list.body.ceiling.none"](formatCOP(1000), 3),
      ].join("\n\n"),
    },
    {
      label: "Pregunta si queda y sí",
      text: renderAvailability(dispUno(true)),
    },
    {
      label: "Pregunta si queda y se agotó",
      text: renderAvailability(dispUno(false)),
    },
    {
      label: "Pregunta si queda y hay varios",
      text: renderAvailability(dispVarios),
    },
    { label: "Pregunta el precio de uno solo", text: renderProductPrice(uno) },
    {
      label: "Pregunta el precio y hay varios",
      text: renderProductPrice(varios),
    },
    {
      label: "Pregunta cómo es un producto",
      text: renderProductFeatures({
        matches: [
          {
            name: "Portacarnet Doraemon",
            description:
              "Lleva tu identificación con la ternura y diversión de Doraemon.\n\nIncluye un protector rígido transparente y una cinta para cuello estampada.",
          },
        ],
        total: 1,
        hasMore: false,
      }),
    },
    {
      label: "Pregunta cómo es, pero hay varios",
      text: renderProductFeatures(varios),
    },
    {
      label: "Pide una foto y hay una",
      text: renderProductPhoto({ ...uno, photo: "https://…/foto.jpg" }),
    },
    {
      label: "Pide una foto pero no tenemos ninguna",
      text: renderProductPhoto({ ...uno, photo: null }),
    },
    {
      label: "Dice «el primero» y la lista ya caducó",
      text: PRODUCT_TEMPLATES["reference.lost"](),
    },
    {
      label: "Cuando hay varios, la lista para tocar",
      text: previewList(),
    },
  ];
}

/**
 * La lista escrita como se ve en el teléfono.
 *
 * Paula aprueba lo que lee la clienta, y aquí lo que cambia no es solo el
 * texto sino la forma: un botón que abre una lista de opciones tocables. Con
 * las palabras sueltas no se entendería, así que se dibuja.
 */
function previewList(): string {
  const ejemplo = [
    { name: "Carpeta plástica oficio verde pastel", price: 12000 },
    { name: "Carpeta plástica oficio rosada", price: 12000 },
    { name: "Carpeta plástica oficio azul pastel", price: 12000 },
  ];
  const filas = buildProductRows(
    ejemplo,
    ejemplo.map((_, i) => `ejemplo-${i}`),
  );
  const dibujo = [
    ...filas.map((f) => `   ▸ ${f.title}\n     ${f.description}`),
    `   ▸ ${TALK_TO_OWNER_BUTTON_TITLE}`,
  ].join("\n");
  return [
    PRODUCT_TEMPLATES["list.body.few"](ejemplo.length),
    ``,
    `[ ${PRODUCT_TEMPLATES["list.button"]()} ] ← la clienta toca aquí y se abre:`,
    ``,
    `   ${PRODUCT_TEMPLATES["list.section"]()}`,
    dibujo,
    ``,
    PRODUCT_TEMPLATES["list.footer"](),
  ].join("\n");
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

export function renderProductPrice(result: SearchResult<ProductMatch>): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.unsure"]();
  if (result.total === 1) {
    return t["price.one"](
      result.matches[0].name,
      formatCOP(result.matches[0].price),
    );
  }
  // La lista ya lleva los precios, así que con dos o tres la pregunta queda
  // contestada en el mismo mensaje aunque nadie diga después cuál era.
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["price.many"](lineas, result.total - result.matches.length)
    : t["price.few"](lineas);
}

export function renderProductFeatures(
  result: SearchResult<FeaturesMatch> | SearchResult<ProductMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.unsure"]();
  const first = result.matches[0];
  if (result.total === 1 && first && "description" in first) {
    return t["features.one"](first.name, first.description);
  }
  const lineas = (result.matches as ProductMatch[])
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["features.which.many"](lineas, result.total - result.matches.length)
    : t["features.which"](lineas);
}

export function renderProductPhoto(result: SearchResult<ProductMatch>): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.unsure"]();
  if (result.total === 1) {
    const only = result.matches[0];
    const precio = formatCOP(only.price);
    // Sin foto utilizable se avisa, porque aquí LA FOTO era lo que pedía.
    return result.photo
      ? t["photo.one"](only.name, precio)
      : t["photo.none.usable"](only.name, precio);
  }
  // Con varios no se manda ninguna foto: primero hay que saber cuál.
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["price.many"](lineas, result.total - result.matches.length)
    : t["price.few"](lineas);
}

export function renderProductSearch(
  result: SearchResult<ProductMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.unsure"]();
  if (result.total === 1) {
    return t["search.one"](
      result.matches[0].name,
      formatCOP(result.matches[0].price),
    );
  }
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["search.many"](lineas, result.total - result.matches.length)
    : t["search.few"](lineas);
}

/**
 * Lo pedido no está, pero el tipo sí. `faltante` es lo que no se encontró
 * (personaje, color…) y `tipo` lo que sí, con las palabras de la clienta.
 */
export function renderPartialSearch(
  faltante: string,
  tipo: string,
  result: SearchResult<ProductMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 1) {
    const only = result.matches[0];
    return t["search.partial.one"](
      faltante,
      tipo,
      only.name,
      formatCOP(only.price),
    );
  }
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["search.partial.many"](
        faltante,
        tipo,
        lineas,
        result.total - result.matches.length,
      )
    : t["search.partial.few"](faltante, tipo, lineas);
}

export function buildPartialListBody(
  faltante: string,
  tipo: string,
  mostrados: number,
  total: number,
): string {
  return total > mostrados
    ? PRODUCT_TEMPLATES["list.body.partial.many"](
        faltante,
        tipo,
        mostrados,
        total - mostrados,
      )
    : PRODUCT_TEMPLATES["list.body.partial"](faltante, tipo, mostrados);
}

/**
 * La lista cuando pidió lo barato o dijo un tope: ya viene ordenada del más
 * económico al más caro y solo con lo que hay para vender.
 */
export function renderCheapSearch(
  result: SearchResult<ProductMatch>,
  price: PriceIntent,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total <= 1) return renderProductSearch(result);
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  const resto = result.total - result.matches.length;
  if (price.maxPrice !== null) {
    const tope = formatCOP(price.maxPrice);
    return result.hasMore
      ? t["search.ceiling.many"](tope, lineas, resto)
      : t["search.ceiling.few"](tope, lineas);
  }
  return result.hasMore ? t["search.cheap.many"](lineas, resto) : t["search.few"](lineas);
}

export function buildCheapListBody(
  mostrados: number,
  total: number,
  price: PriceIntent,
): string {
  const t = PRODUCT_TEMPLATES;
  if (price.maxPrice !== null) {
    const tope = formatCOP(price.maxPrice);
    return total > mostrados
      ? t["list.body.ceiling.many"](tope, mostrados, total - mostrados)
      : t["list.body.ceiling"](tope, mostrados);
  }
  return total > mostrados
    ? t["list.body.cheap.many"](mostrados, total - mostrados)
    : t["list.body.few"](mostrados);
}

/** Con el tope no quedó nada: lo más económico que sí hay, diciendo que pasa del tope. */
export function renderCeilingMiss(
  maxPrice: number,
  result: SearchResult<ProductMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  const tope = formatCOP(maxPrice);
  if (result.total === 1) {
    const only = result.matches[0];
    return t["search.ceiling.none.one"](tope, only.name, formatCOP(only.price));
  }
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return t["search.ceiling.none"](tope, lineas);
}

/**
 * Cero resultados: un solo mensaje con la categoría más cercana, o la búsqueda
 * de la tienda si ninguna encaja, y Paula ofrecida (no llamada).
 */
export function renderNoResults(
  busqueda: string,
  categoria: { name: string; slug: string } | null,
): string {
  const t = PRODUCT_TEMPLATES;
  const frase = busqueda.trim();
  if (categoria?.slug) {
    return t["search.none.category"](
      frase,
      // Tal como está en el catálogo: «Sanrio» no se puede escribir en minúscula.
      categoria.name,
      categoryUrl(categoria.slug),
    );
  }
  return t["search.none.store"](frase, storeSearchUrl(searchTokens(frase).join(" ") || frase));
}

export function renderAvailability(
  result: SearchResult<AvailabilityMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.unsure"]();
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

// --- 4. La lista tocable ------------------------------------------------

/** Corta por la última palabra entera que quepa; «…» avisa de que se cortó. */
function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max / 3 ? corte.slice(0, espacio) : corte).trim()}…`;
}

/** Lo mismo pero por el final: conserva lo que distingue, que suele ir ahí. */
function recortarPorElFinal(texto: string, max: number): string {
  const palabras = texto.replace(/\s+/g, " ").trim().split(" ");
  const cola: string[] = [];
  for (let i = palabras.length - 1; i >= 0; i -= 1) {
    const prueba = [palabras[i], ...cola].join(" ");
    if (prueba.length > max - 1) break;
    cola.unshift(palabras[i]);
  }
  return cola.length > 0 ? `…${cola.join(" ")}` : recortar(texto, max);
}

/** Las palabras que TODOS comparten al principio, sin dejar a nadie sin nada. */
function prefijoComun(nombres: string[]): number {
  if (nombres.length < 2) return 0;
  const palabras = nombres.map((n) => n.replace(/\s+/g, " ").trim().split(" "));
  let comunes = 0;
  const minimo = Math.min(...palabras.map((p) => p.length));
  while (comunes < minimo - 1) {
    const palabra = palabras[0][comunes].toLowerCase();
    if (!palabras.every((p) => p[comunes].toLowerCase() === palabra)) break;
    comunes += 1;
  }
  return comunes;
}

/**
 * Títulos cortos y, sobre todo, distintos entre sí. Se quita lo que todos
 * repiten al principio y queda lo que los separa; si aún coinciden se prueba
 * por el final, y si no, se numeran. El nombre entero va en la descripción.
 */
export function buildRowTitles(nombres: string[]): string[] {
  const limpios = nombres.map((n) => n.replace(/\s+/g, " ").trim());
  const comunes = prefijoComun(limpios);
  const base = limpios.map((n) => {
    const palabras = n.split(" ");
    const resto = palabras.slice(comunes).join(" ");
    return resto || n;
  });

  const titulos = base.map((n) =>
    recortar(n, WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH),
  );

  // Segunda pasada: a los repetidos se les mira la cola.
  const cuenta = new Map<string, number>();
  titulos.forEach((t) => cuenta.set(t, (cuenta.get(t) ?? 0) + 1));
  const segunda = titulos.map((t, i) =>
    (cuenta.get(t) ?? 0) > 1
      ? recortarPorElFinal(base[i], WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH)
      : t,
  );

  // Último recurso: numerarlos. Feo, pero nunca dos iguales.
  const vistos = new Set<string>();
  return segunda.map((t) => {
    if (!vistos.has(t)) {
      vistos.add(t);
      return t;
    }
    for (let n = 2; ; n += 1) {
      const sufijo = ` (${n})`;
      const corto = `${recortar(t, WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH - sufijo.length)}${sufijo}`;
      if (!vistos.has(corto)) {
        vistos.add(corto);
        return corto;
      }
    }
  });
}

/**
 * Las filas de producto, listas para mandar.
 *
 * El id lleva el producto, así que lo que se toca no depende de lo que se lee:
 * el título puede estar recortado y la respuesta sigue siendo la correcta.
 */
export function buildProductRows(
  matches: ProductMatch[],
  ids: string[],
): WhatsAppListRow[] {
  const titulos = buildRowTitles(matches.map((m) => m.name));
  return matches
    .map((m, i) => ({ m, id: ids[i], title: titulos[i] }))
    .filter((r) => Boolean(r.id))
    .map((r) => ({
      id: buildProductRowId(r.id),
      title: r.title,
      // El nombre entero cabe: ninguno de los 845 del catálogo pasa de 72, y
      // con el precio al lado la fila ya dice todo lo que decía el texto.
      description: recortar(
        `${r.m.name} — ${formatCOP(r.m.price)}`,
        WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
      ),
    }));
}

/** Igual, pero cuando lo que se preguntó fue si queda. */
export function buildAvailabilityRows(
  matches: AvailabilityMatch[],
  ids: string[],
): WhatsAppListRow[] {
  const titulos = buildRowTitles(matches.map((m) => m.name));
  return matches
    .map((m, i) => ({ m, id: ids[i], title: titulos[i] }))
    .filter((r) => Boolean(r.id))
    .map((r) => ({
      id: buildProductRowId(r.id),
      title: r.title,
      description: recortar(
        `${r.m.name} — ${r.m.inStock ? "disponible" : "agotado por ahora"}`,
        WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
      ),
    }));
}

/** El texto que acompaña a la lista; no repite las opciones, ya están dentro. */
export function buildListBody(mostrados: number, total: number): string {
  return total > mostrados
    ? PRODUCT_TEMPLATES["list.body.many"](mostrados, total - mostrados)
    : PRODUCT_TEMPLATES["list.body.few"](mostrados);
}

/** La fila de Paula, siempre la última. Mismo id que su botón de siempre. */
export function buildOwnerRow(): WhatsAppListRow {
  return { id: TALK_TO_OWNER_BUTTON_ID, title: TALK_TO_OWNER_BUTTON_TITLE };
}

// --- Unir las tres piezas --------------------------------------------------

/**
 * Lo que el bot decidió al contestar una pregunta de producto. Se guarda con
 * el mensaje (`ConversationMessage.metadata.decision`) para poder revisar
 * después qué entendió, qué buscó y cuánto encontró, sin tener que recorrer
 * las conversaciones una por una como hubo que hacer con el fallo del tote bag.
 * No lleva existencias ni ids: solo palabras y cuentas.
 */
export interface ProductDecision {
  intent: ProductIntent;
  /** Las ranuras tal como las devolvió el modelo. */
  slots: {
    productType: string | null;
    character: string | null;
    descriptor: string | null;
  };
  /** Lo que se buscó de verdad, después de las ranuras o del mensaje en crudo. */
  query: string;
  /** Cuántos productos dio esa búsqueda. */
  total: number;
  /** La segunda búsqueda, solo por el tipo, cuando la primera dio cero. */
  retry?: { query: string; total: number };
  /** Cómo acabó: con lo pedido, con lo que sí hay, o sin nada (enlace o Paula). */
  outcome: "match" | "partial" | "unsure";
  /** Solo cuando no salió lo pedido: por qué. */
  reason?: ProductNoMatchReason;
  /** Pidió lo barato o un tope. */
  price?: PriceIntent;
  /** «catalog»: se buscó sin preguntarle al modelo (todas las palabras eran del catálogo). */
  source?: "catalog";
}

/** Los precios que dice el texto, cuando todos los productos llevan uno (búsqueda, precio, foto). */
function quotedPrices(matches: readonly unknown[]): number[] | undefined {
  const prices = matches.map((match) => (match as { price?: unknown }).price);
  return prices.length > 0 && prices.every((price): price is number => typeof price === "number") ? (prices as number[]) : undefined;
}

export interface ProductAnswer {
  intent: ProductIntent;
  text: string;
  /** Para el archivo: qué se entendió, qué se buscó y qué salió. */
  decision?: ProductDecision;
  /**
   * No se encontró nada seguro: el texto ya dice que Paula escribe, así que
   * la conversación tiene que quedar marcada para ella y el mensaje sale sin
   * el botón de «Hablar con Paula», que sería pedir lo que ya se hizo.
   */
  handoff?: boolean;
  /** Va con la respuesta cuando hay un solo producto y tiene foto sana. */
  photo?: string | null;
  /**
   * Lo que se acaba de enseñar, en el orden en que sale escrito. Se guarda con
   * el mensaje para que «el primero» tenga a qué referirse.
   */
  shownIds?: string[];
  /** El precio por unidad que dice el texto, en el orden de `shownIds`; solo si lo dice. */
  shownPrices?: number[];
  /**
   * Cuando hay varios, se manda como lista tocable en vez de como texto.
   * `text` sigue siendo la versión escrita, que es a la que se cae si Meta
   * rechaza la lista: perder la lista es un detalle, callar no.
   */
  list?: { body: string; rows: WhatsAppListRow[] };
  /** No salió lo pedido: cero resultados, o nada que pasara el filtro de precio o existencias. */
  noMatchReason?: ProductNoMatchReason;
}

const MARCA_LENTA = Symbol("lenta");

/**
 * Clasifica y, si tarda, avisa.
 *
 * El aviso no interrumpe nada: se sigue esperando la misma respuesta. Quien
 * manda el mensaje es `bot.ts` —aquí no se envía nada por WhatsApp, y eso no
 * cambia—, así que esto solo sabe CUÁNDO merece la pena avisar.
 */
async function clasificarAvisandoSiTarda(
  body: string,
  onSlow?: () => Promise<void>,
): Promise<ClassifyOutcome> {
  const clasificando = classifyProductQuestion(body);
  if (!onSlow) return clasificando;

  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const aviso = new Promise<typeof MARCA_LENTA>((resolve) => {
    temporizador = setTimeout(
      () => resolve(MARCA_LENTA),
      PRODUCT_CLASSIFIER_SLOW_NOTICE_MS,
    );
  });

  try {
    const primero = await Promise.race([clasificando, aviso]);
    if (primero === MARCA_LENTA) {
      // Si el aviso no sale, mala suerte: lo que no puede es tumbar la
      // respuesta de verdad, que es la que la clienta está esperando.
      try {
        await onSlow();
      } catch (error) {
        console.warn("[WHATSAPP_BOT] No se pudo avisar de que iba lento", {
          error,
        });
      }
    }
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }

  return clasificando;
}

export interface ProductAnswerResult {
  answer: ProductAnswer | null;
  /** Por qué no hubo respuesta con productos; null cuando la hubo. */
  reason: ProductNoMatchReason | null;
  /** El matiz: el motivo del clasificador («quota», «timeout»…). Solo para el archivo. */
  detail?: string;
}

/**
 * Como `answerProductQuestion`, pero diciendo por qué no hubo respuesta. Es
 * la que conviene llamar desde `bot.ts` para archivar el motivo.
 *
 * `handoffOnMiss`: con cero resultados se contesta con el enlace y SIN pasar
 * a Paula. Si quien llama sabe que ya hubo un fallo antes en la conversación,
 * lo pide y se vuelve al «déjame confirmarlo con Paula» de siempre.
 */
export async function answerProductQuestionDetailed(
  storeId: string,
  body: string,
  options: { onSlow?: () => Promise<void>; handoffOnMiss?: boolean } = {},
): Promise<ProductAnswerResult> {
  const gate = await productQuestionGate(storeId, body);
  if (!gate.pass) return { answer: null, reason: "no_signal" };
  const { parsed, index } = gate;
  const price = parsed.price;

  let c: ProductClassification;
  let source: "catalog" | "classifier";
  const fija = intentWithoutModel(body, parsed);
  if (fija) {
    source = "catalog";
    c = { intent: fija, productType: parsed.query, character: null, descriptor: null };
  } else {
    source = "classifier";
    const classified = await clasificarAvisandoSiTarda(body, options.onSlow);
    if (!classified.ok) {
      // Sin cuota es lo esperable en horas punta, no una avería: se anota flojito
      // y el mensaje sigue. Lo demás sí merece mirarse.
      const log = classified.reason === "quota" ? console.warn : console.error;
      log("[WHATSAPP_BOT] no se pudo clasificar la pregunta de producto", {
        storeId,
        reason: classified.reason,
      });
      return { answer: null, reason: "classifier_failed", detail: classified.reason };
    }
    if (classified.value.intent === "other") {
      return { answer: null, reason: "classifier_other" };
    }
    // «barato» en una ranura se buscaría como parte del nombre y daría cero,
    // y luego «De baratos no tengo». El precio ya está en `price`.
    c = {
      ...classified.value,
      productType: stripPriceWords(classified.value.productType),
      character: stripPriceWords(classified.value.character),
      descriptor: stripPriceWords(classified.value.descriptor),
    };
  }
  const intent = c.intent as ProductIntent;

  // Si las tres ranuras vienen vacías, se busca el mensaje en crudo antes de
  // darse por vencido: casi siempre queda ahí lo que hace falta.
  let consulta = buildSearchQuery(c);
  if (searchTokens(consulta).length === 0) {
    consulta = parsed.query;
    if (consulta) {
      console.info("[WHATSAPP_BOT] Sin ranuras; se busca el mensaje en crudo", {
        storeId,
        consulta,
      });
    }
  }
  // Con UNA sola palabra no se contesta, salvo que sea del catálogo.
  //
  // «útiles» encontraba ocho productos y se los enseñaba como si fueran la
  // respuesta; era un listado al azar con cara de respuesta. Pero
  // «marcadores» o «resaltadores» nombran un estante concreto de la tienda, y
  // la lista de ese estante sí contesta.
  const tokens = searchTokens(consulta);
  const unaDelCatalogo = tokens.length === 1 && isKnownTerm(index, tokens[0]);
  if (tokens.length < MIN_SEARCH_TOKENS && !unaDelCatalogo) {
    if (tokens.length > 0) {
      console.info("[WHATSAPP_BOT] Pregunta demasiado vaga; no se adivina", {
        storeId,
        consulta,
      });
    }
    return { answer: null, reason: "few_tokens" };
  }
  // A partir de aquí se busca `consulta`, no las ranuras sueltas.
  const buscar: ProductClassification = {
    ...c,
    productType: consulta,
    character: null,
    descriptor: null,
  };
  const decision: ProductDecision = {
    intent,
    slots: {
      productType: c.productType,
      character: c.character,
      descriptor: c.descriptor,
    },
    query: consulta,
    total: 0,
    outcome: "match",
    ...(source === "catalog" ? { source } : {}),
    ...(price ? { price } : {}),
  };

  const resuelto = await resolverSegunIntencion(storeId, intent, buscar, price);
  if (!resuelto) return { answer: null, reason: null, detail: "sin_descripcion_util" };
  const { value, text, rows, listBody } = resuelto;
  decision.total = value.total;

  if (value.total > 0) {
    return {
      answer: {
        intent,
        text,
        photo: value.photo,
        shownIds: value.ids,
        shownPrices: quotedPrices(value.matches),
        list: listaSiHayVarios(value, rows, listBody),
        decision,
      },
      reason: null,
    };
  }

  // Pidió lo barato o un tope y no quedó nada: ¿es que no hay, o que no pasa
  // el filtro? Si hay, se enseña con lo que falla dicho, no se esconde.
  if (price) {
    const filtrado = await filtradoPorPrecio(storeId, intent, buscar, price, decision);
    if (filtrado) return { answer: filtrado, reason: "filtered_out" };
  }

  // Cero. Antes esto era «no lo tengo», y se dijo con un producto activo y
  // con existencias delante (el tote bag de perrito, 30 de septiembre). Cero
  // resultados quiere decir que la búsqueda no lo encontró, no que no exista.
  //
  // Se prueba una segunda vez solo con el tipo: si «tote bag de dinosaurio» no
  // da nada pero «tote bag» sí, se dice lo que falta y se enseña lo que hay.
  const soloTipo = tipoSolo(c, consulta);
  if (soloTipo) {
    const fact = await resolveProductSearch(
      storeId,
      { ...c, productType: soloTipo.tipo, character: null, descriptor: null },
      { price },
    );
    if (fact.known) {
      decision.retry = { query: soloTipo.tipo, total: fact.value.total };
      if (fact.value.total > 0) {
        const v = fact.value;
        const filas = buildProductRows(v.matches, v.ids ?? []);
        return {
          answer: {
            intent,
            text: renderPartialSearch(soloTipo.faltante, soloTipo.tipo, v),
            photo: v.photo,
            shownIds: v.ids,
            shownPrices: quotedPrices(v.matches),
            list:
              v.total >= 2 && filas.length >= 2
                ? {
                    body: buildPartialListBody(
                      soloTipo.faltante,
                      soloTipo.tipo,
                      filas.length,
                      v.total,
                    ),
                    rows: filas,
                  }
                : undefined,
            decision: { ...decision, outcome: "partial" },
          },
          reason: null,
        };
      }
    }
  }

  // Ni el tipo aparece. Si Paula ya está en camino por un fallo anterior, se
  // le pasa con el «déjame confirmar» de siempre; si no, se manda el enlace
  // y se le ofrece Paula, sin llamarla todavía.
  if (options.handoffOnMiss) {
    return {
      answer: {
        intent,
        text: PRODUCT_TEMPLATES["search.unsure"](),
        handoff: true,
        noMatchReason: "zero_results",
        decision: { ...decision, outcome: "unsure", reason: "zero_results" },
      },
      reason: "zero_results",
    };
  }
  const categoria = closestCategory(index, searchTokens(soloTipo?.tipo ?? consulta));
  return {
    answer: {
      intent,
      text: renderNoResults(consulta, categoria),
      noMatchReason: "zero_results",
      decision: { ...decision, outcome: "unsure", reason: "zero_results" },
    },
    reason: "zero_results",
  };
}

/**
 * La respuesta sobre productos, o `null` si aquí no hay nada que contestar:
 * el mensaje no iba de esto, el modelo no pudo, o no se entendió qué buscaba.
 * Un `null` nunca es el final del camino, solo significa «que siga».
 */
export async function answerProductQuestion(
  storeId: string,
  body: string,
  options: { onSlow?: () => Promise<void>; handoffOnMiss?: boolean } = {},
): Promise<ProductAnswer | null> {
  return (await answerProductQuestionDetailed(storeId, body, options)).answer;
}

/**
 * Con precio no salió nada. Dos casos que se distinguen:
 *  - dijo un tope y todo pasa de él: lo más económico que sí hay, diciéndolo;
 *  - todo lo que hay está agotado: se dice así, producto por producto, con
 *    las plantillas de siempre.
 * `null` si sin el filtro tampoco hay nada: entonces es cero de verdad.
 */
async function filtradoPorPrecio(
  storeId: string,
  intent: ProductIntent,
  buscar: ProductClassification,
  price: PriceIntent,
  decision: ProductDecision,
): Promise<ProductAnswer | null> {
  if (price.maxPrice !== null) {
    const sinTope = await resolveProductSearch(storeId, buscar, {
      price: { sort: "cheapest", maxPrice: null },
    });
    if (sinTope.known && sinTope.value.total > 0) {
      const v = sinTope.value;
      const filas = buildProductRows(v.matches, v.ids ?? []);
      return {
        intent,
        text: renderCeilingMiss(price.maxPrice, v),
        photo: v.photo,
        shownIds: v.ids,
        shownPrices: quotedPrices(v.matches),
        list:
          v.total >= 2 && filas.length >= 2
            ? {
                body: PRODUCT_TEMPLATES["list.body.ceiling.none"](formatCOP(price.maxPrice), filas.length),
                rows: filas,
              }
            : undefined,
        noMatchReason: "filtered_out",
        decision: {
          ...decision,
          retry: { query: decision.query, total: v.total },
          outcome: "partial",
          reason: "filtered_out",
        },
      };
    }
  }
  const agotados = await resolveAvailability(storeId, buscar);
  if (!agotados.known || agotados.value.total === 0) return null;
  const v = agotados.value;
  return {
    intent,
    text: renderAvailability(v),
    photo: v.photo,
    shownIds: v.ids,
    list: listaSiHayVarios(v, buildAvailabilityRows(v.matches, v.ids ?? [])),
    noMatchReason: "filtered_out",
    decision: {
      ...decision,
      retry: { query: decision.query, total: v.total },
      outcome: "partial",
      reason: "filtered_out",
    },
  };
}

/**
 * La búsqueda y el texto que le corresponden a cada intención. `null` cuando
 * no se sabe: sin nada que buscar, o un solo producto sin descripción útil
 * (el único caso que se escala por falta de datos).
 */
async function resolverSegunIntencion(
  storeId: string,
  intent: ProductIntent,
  buscar: ProductClassification,
  price: PriceIntent | null = null,
): Promise<{
  value: SearchResult<ProductMatch | AvailabilityMatch | FeaturesMatch>;
  text: string;
  rows: WhatsAppListRow[];
  listBody?: string;
} | null> {
  // Con precio da igual cómo lo preguntó: la respuesta es la lista ordenada
  // por precio, y solo con lo que hay (así que «si queda» ya está contestado).
  // La foto de un único producto sigue saliendo como foto.
  if (price) {
    const fact = await resolveProductSearch(storeId, buscar, { price });
    if (!fact.known) return null;
    const v = fact.value;
    const rows = buildProductRows(v.matches, v.ids ?? []);
    return {
      value: v,
      text: intent === "product.photo" && v.total === 1 ? renderProductPhoto(v) : renderCheapSearch(v, price),
      rows,
      listBody: buildCheapListBody(rows.length, v.total, price),
    };
  }
  if (intent === "product.availability") {
    const fact = await resolveAvailability(storeId, buscar);
    if (!fact.known) return null;
    return {
      value: fact.value,
      text: renderAvailability(fact.value),
      rows: buildAvailabilityRows(fact.value.matches, fact.value.ids ?? []),
    };
  }
  if (intent === "product.features") {
    const fact = await resolveProductFeatures(storeId, buscar);
    if (!fact.known) return null;
    return {
      value: fact.value,
      text: renderProductFeatures(fact.value),
      rows: buildProductRows(
        fact.value.matches as ProductMatch[],
        fact.value.ids ?? [],
      ),
    };
  }
  const fact =
    intent === "product.price"
      ? await resolveProductPrice(storeId, buscar)
      : await resolveProductSearch(storeId, buscar);
  if (!fact.known) return null;
  const text =
    intent === "product.price"
      ? renderProductPrice(fact.value)
      : intent === "product.photo"
        ? renderProductPhoto(fact.value)
        : renderProductSearch(fact.value);
  return {
    value: fact.value,
    text,
    rows: buildProductRows(fact.value.matches, fact.value.ids ?? []),
  };
}

/**
 * Qué se vuelve a buscar cuando la consulta entera dio cero: el tipo solo,
 * si el modelo lo separó y si había algo más que quitar.
 *
 * Aquí el tipo puede ser UNA palabra, al contrario que en la primera búsqueda:
 * «cuaderno» a secas era una lista al azar con cara de respuesta, pero «de
 * Kuromi no tengo, pero de cuaderno sí, mira» dice exactamente lo que es.
 */
export function tipoSolo(
  c: ProductClassification,
  consulta: string,
): { tipo: string; faltante: string } | null {
  const tipo = c.productType?.trim() ?? "";
  const faltante = [c.character, c.descriptor]
    .map((s) => s?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  if (!tipo || !faltante) return null;
  const tokensTipo = searchTokens(tipo);
  if (tokensTipo.length === 0) return null;
  // Si el tipo ya era toda la consulta, repetirla daría lo mismo.
  if (tokensTipo.join(" ") === searchTokens(consulta).join(" ")) return null;
  return { tipo, faltante };
}

/**
 * Con uno solo no hay nada que elegir: va la respuesta de siempre, con su foto.
 * La lista es para cuando hay que decidir.
 */
function listaSiHayVarios(
  result: { total: number; ids?: string[] },
  rows: WhatsAppListRow[],
  body?: string,
): { body: string; rows: WhatsAppListRow[] } | undefined {
  if (result.total < 2 || rows.length < 2) return undefined;
  return { body: body ?? buildListBody(rows.length, result.total), rows };
}

/**
 * La respuesta sobre un producto ya identificado. Se vuelve a consultar el
 * catálogo: el precio y las existencias pueden haber cambiado.
 */
export async function answerAboutProduct(
  storeId: string,
  productId: string,
  intent: ProductIntent,
): Promise<ProductAnswer | null> {
  const producto = (await prismadb.product.findFirst({
    where: { id: productId, storeId, isArchived: false },
    select: {
      ...MATCH_SELECT,
      description: true,
      images: {
        where: { brokenAt: null },
        orderBy: { isMain: "desc" as const },
        select: { url: true },
        take: 1,
      },
    },
  })) as {
    id: string;
    name: string;
    price: number;
    stock: number;
    reservedUnits: number;
    categoryId: string;
    productGroupId: string | null;
    description: string | null;
    images: { url: string }[];
  } | null;
  if (!producto) return null;
  const precio = (await effectiveUnitPrices(storeId, [producto])).get(producto.id) ?? producto.price;

  const foto = pickPhoto(producto.images);
  const base = { total: 1, hasMore: false, ids: [producto.id], photo: foto };
  const comun = { intent, photo: foto, shownIds: [producto.id] };

  if (intent === "product.availability") {
    return {
      ...comun,
      text: renderAvailability({
        ...base,
        matches: [{ name: producto.name, inStock: availableStock(producto) > 0 }],
      }),
    };
  }

  if (intent === "product.features") {
    const descripcion = cleanDescription(producto.description);
    // Igual que en la búsqueda: sin descripción utilizable no se inventa nada.
    if (descripcion.length < MIN_USEFUL_DESCRIPTION_LENGTH) return null;
    return {
      ...comun,
      text: renderProductFeatures({
        ...base,
        matches: [
          { name: producto.name, description: trimForWhatsApp(descripcion) },
        ],
      }),
    };
  }

  const uno: SearchResult<ProductMatch> = {
    ...base,
    matches: [{ name: producto.name, price: precio }],
  };
  const conPrecio = { ...comun, shownPrices: [precio] };
  if (intent === "product.price")
    return { ...conPrecio, text: renderProductPrice(uno) };
  if (intent === "product.photo")
    return { ...conPrecio, text: renderProductPhoto(uno) };
  return { ...conPrecio, text: renderProductSearch(uno) };
}
