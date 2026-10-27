import prismadb from "@/lib/prismadb";
import { stripTaxonomyIcon } from "@/lib/category-seo";
import {
  SYNONYM_GROUPS,
  colorLemma,
  nameForms,
  pluralStem,
  searchTokens,
} from "@/lib/search-terms";

/**
 * Lo que dice un mensaje de WhatsApp sobre lo que se busca, sin modelo:
 * palabras de precio, tope de precio, términos del catálogo y familias de
 * productos. Solo lo usa el bot; el buscador de la tienda no pasa por aquí.
 *
 * Nació del 27 de octubre: «marcadores baratos» acabó en «Esa no me la sé».
 * El portero no veía pregunta, una sola palabra no bastaba, y «barato» se
 * buscaba como si fuera parte del nombre del producto.
 */

/** Por qué una pregunta de producto se quedó sin respuesta. Se archiva con el mensaje. */
export type ProductNoMatchReason =
  /** El portero no vio ni pregunta ni término del catálogo. */
  | "no_signal"
  /** Quedó una sola palabra y no es del catálogo: no se adivina. */
  | "few_tokens"
  /** La búsqueda (y la segunda, solo por el tipo) dio cero. */
  | "zero_results"
  /** Había productos, pero ninguno pasaba el filtro: agotados o por encima del tope. */
  | "filtered_out"
  /** El clasificador no contestó (sin clave, sin cuota, lento o respuesta inválida). */
  | "classifier_failed"
  /** El clasificador dijo que el mensaje no iba de productos. */
  | "classifier_other";

export const PRODUCT_NO_MATCH_REASONS: readonly ProductNoMatchReason[] = [
  "no_signal",
  "few_tokens",
  "zero_results",
  "filtered_out",
  "classifier_failed",
  "classifier_other",
];

// --- Precio -----------------------------------------------------------------

/**
 * «Barato» no es un umbral: es un orden. Lo más económico primero, solo lo
 * que hay para vender. Con un tope dicho («menos de 10 mil») se filtra además
 * por precio; sin tope nunca se inventa uno.
 */
export interface PriceIntent {
  sort: "cheapest";
  maxPrice: number | null;
}

const L = "[\\p{L}\\d]";
const antes = `(?<!${L})`;
const despues = `(?!${L})`;

/**
 * «Bajo» o «baja» sueltos no cuentan: «carpeta baja» es una carpeta, no un
 * precio. Solo «precio bajo» y «bajo precio», con la palabra «precio» delante.
 */
const PRICE_WORD_PATTERNS = [
  `(?:(?:lo|los|las|la|el)\\s+)?(?:m[aá]s\\s+)?barat(?:[ií]sim[oa]s?|ic[oa]s?|[oa]s?)`,
  `(?:(?:lo|los|las|la|el)\\s+)?(?:m[aá]s\\s+)?econ[oó]mic[oa]s?`,
  `(?:a\\s+|de\\s+)?(?:un\\s+)?precios?\\s+baj[oi]s?`,
  `(?:a\\s+|de\\s+)?bajo\\s+precio`,
].map((p) => new RegExp(`${antes}${p}${despues}`, "giu"));

/** Cantidades: «10 mil», «10mil», «10.000», «$10000», «10k», «10 lucas». */
const AMOUNT = `\\$?\\s*(\\d{1,3}(?:[.,]\\d{3})+|\\d+)(?:\\s*(mil|k|lucas))?(?:\\s*pesos)?`;

const CEILING_PATTERNS = [
  new RegExp(
    `${antes}(?:de\\s+|por\\s+)?(?:menos\\s+de|hasta|m[aá]ximo(?:\\s+de)?|max|por\\s+debajo\\s+de|no\\s+m[aá]s\\s+de|que\\s+no\\s+pase(?:n)?\\s+de)\\s*${AMOUNT}${despues}`,
    "giu",
  ),
  new RegExp(`${antes}(?:de\\s+)?${AMOUNT}\\s+o\\s+menos${despues}`, "giu"),
];

/**
 * El valor de una cantidad, o null si no parece dinero. Un número pelado y
 * pequeño («hasta 12») no se lee como precio: puede ser hojas o colores.
 */
export function parseAmount(raw: string): number | null {
  const m = raw.match(new RegExp(AMOUNT, "iu"));
  if (!m) return null;
  const [, digits, unidad] = m;
  const conSeparador = /[.,]/.test(digits);
  const valor = Number(digits.replace(/[.,]/g, ""));
  if (!Number.isFinite(valor) || valor <= 0) return null;
  if (unidad) return valor * 1000;
  if (conSeparador || raw.includes("$") || valor >= 1000) return valor;
  return null;
}

export interface ParsedPrice {
  price: PriceIntent | null;
  /** El mensaje sin las palabras de precio ni el tope. */
  rest: string;
}

export function parsePriceIntent(body: string): ParsedPrice {
  let rest = body;
  let maxPrice: number | null = null;
  let barato = false;

  for (const pattern of CEILING_PATTERNS) {
    rest = rest.replace(pattern, (span) => {
      const valor = parseAmount(span);
      if (valor === null) return span;
      maxPrice = maxPrice === null ? valor : Math.min(maxPrice, valor);
      return " ";
    });
  }
  for (const pattern of PRICE_WORD_PATTERNS) {
    rest = rest.replace(pattern, () => {
      barato = true;
      return " ";
    });
  }

  rest = rest.replace(/\s+/g, " ").trim();
  if (maxPrice === null && !barato) return { price: null, rest: body };
  return { price: { sort: "cheapest", maxPrice }, rest };
}

/** Quita las palabras de precio de una ranura del clasificador; vacía → null. */
export function stripPriceWords(value: string | null): string | null {
  if (!value) return value;
  const { rest } = parsePriceIntent(value);
  return rest.trim() ? rest.trim() : null;
}

// --- Familias de productos ---------------------------------------------------

/**
 * Lo que la clienta incluye cuando pide algo, más allá de los sinónimos.
 *
 * Los sinónimos de `SYNONYM_GROUPS` (lib/search-terms.ts) son equivalencias y
 * los usa también la tienda: no se tocan desde aquí. Esto es otra cosa, una
 * familia en un solo sentido y solo para WhatsApp: quien pide «marcadores»
 * acepta un resaltador o una micropunta (en Colombia todo eso es marcador),
 * pero quien pide «resaltadores» no quiere ver plumones.
 *
 *  - marcador / plumón / rotulador → además resaltadores, micropuntas y
 *    rotuladores de punta fina.
 *  - micropunta → también «punta fina».
 *  - colores → también «lápices de colores».
 *
 * Cada término puede ser una frase: «lápices de colores» exige las dos
 * palabras, cada una con sus formas.
 */
const RELATED_FAMILIES: { keys: string[]; include: string[] }[] = [
  {
    keys: ["marcador", "plumón", "rotulador"],
    include: ["resaltador", "micropunta", "punta fina"],
  },
  { keys: ["micropunta"], include: ["punta fina"] },
  { keys: ["colores"], include: ["lápices de colores", "lápiz de color"] },
];

export const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "");

const llaveDe = (word: string) =>
  stripAccents(pluralStem(stripAccents(word.toLocaleLowerCase("es-CO"))));

/** Las llaves con que se reconoce una palabra: su raíz, sin tildes, y sin la «s». */
function llaves(word: string): string[] {
  const plain = stripAccents(word.trim().toLocaleLowerCase("es-CO"));
  const set = new Set([llaveDe(plain), plain]);
  if (plain.endsWith("s")) set.add(plain.slice(0, -1));
  return Array.from(set).filter(Boolean);
}

const relatedByKey = new Map<string, string[]>();
for (const familia of RELATED_FAMILIES) {
  for (const key of familia.keys) {
    for (const k of llaves(key)) relatedByKey.set(k, familia.include);
  }
}

/** Lo que además se busca para una palabra; vacío si no tiene familia. */
export function relatedTerms(token: string): string[] {
  for (const k of llaves(token)) {
    const found = relatedByKey.get(k);
    if (found) return found;
  }
  return [];
}

// --- Términos del catálogo ----------------------------------------------------

/**
 * Palabras de un nombre de categoría que no nombran un producto: con
 * «Bolsos pequeños» en el catálogo, «algo pequeño» no debe parecer pregunta.
 */
const GENERIC_WORDS = new Set([
  "pequeno", "pequena", "grande", "mediano", "mediana", "nuevo", "nueva",
  "otro", "otra", "otros", "otras", "varios", "general", "especial",
]);

const MIN_TERM_LENGTH = 4;

export interface CatalogCategory {
  name: string;
  slug: string;
  keys: Set<string>;
}

export interface CatalogTermIndex {
  /** Llaves (raíz sin tildes) de las palabras que nombran un producto. */
  keys: Set<string>;
  categories: CatalogCategory[];
  /**
   * Llave de una palabra → categorías que ella nombra. `exact`: el tipo o la
   * categoría se llama exactamente así («Cuadernos», «Colores»); `head`: es
   * su primera palabra («Cuadernos de lettering»).
   */
  taxonomy?: { exact: Map<string, Set<string>>; head: Map<string, Set<string>> };
}

function palabrasUtiles(name: string): string[] {
  return searchTokens(stripTaxonomyIcon(name))
    .map((w) => stripAccents(w))
    .filter(
      (w) =>
        w.length >= MIN_TERM_LENGTH &&
        !GENERIC_WORDS.has(w) &&
        !GENERIC_WORDS.has(llaveDe(w)) &&
        !/^\d+$/.test(w) &&
        colorLemma(w) === null,
    );
}

/** Lo que se reconoce sin mirar la base: los sinónimos y las familias de arriba. */
const STATIC_KEYS = new Set<string>();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    if (term.includes(" ") || term.includes("-")) continue;
    for (const k of llaves(term)) STATIC_KEYS.add(k);
  }
}
for (const familia of RELATED_FAMILIES) {
  for (const term of [...familia.keys, ...familia.include]) {
    if (term.includes(" ")) continue;
    for (const k of llaves(term)) STATIC_KEYS.add(k);
  }
}

function palabrasDelNombre(name: string): string[] {
  return searchTokens(stripTaxonomyIcon(name).replace(/[&/+,]/g, " ")).map((w) => stripAccents(w));
}

function anotar(mapa: Map<string, Set<string>>, palabra: string, ids: string[]) {
  for (const k of llaves(palabra)) {
    const set = mapa.get(k) ?? new Set<string>();
    ids.forEach((id) => set.add(id));
    mapa.set(k, set);
  }
}

function buildTaxonomy(
  types: { id?: string; name: string }[],
  categories: { id?: string; name: string; typeId?: string }[],
) {
  const exact = new Map<string, Set<string>>();
  const head = new Map<string, Set<string>>();
  const deTipo = (typeId: string) =>
    categories.filter((c) => c.typeId === typeId && c.id).map((c) => c.id as string);
  const entradas = [
    ...types.filter((t) => t.id).map((t) => ({ name: t.name, ids: deTipo(t.id as string) })),
    ...categories.filter((c) => c.id).map((c) => ({ name: c.name, ids: [c.id as string] })),
  ];
  for (const { name, ids } of entradas) {
    const palabras = palabrasDelNombre(name);
    if (palabras.length === 0 || ids.length === 0) continue;
    if (palabras.length === 1) anotar(exact, palabras[0], ids);
    else anotar(head, palabras[0], ids);
  }
  return { exact, head };
}

/**
 * Las categorías que una palabra nombra por sí sola, o null si ninguna.
 * `exact`: algún tipo o categoría se llama exactamente así; entonces se suman
 * también las que empiezan por ella («cuadernos» trae el tipo «Cuadernos» y
 * «Cuadernos de lettering»). Sin igualdad, solo las que empiezan por ella.
 */
export function taxonomyCategoryIds(
  index: CatalogTermIndex,
  token: string,
): { ids: string[]; exact: boolean } | null {
  if (!index.taxonomy) return null;
  const ids = new Set<string>();
  let exact = false;
  for (const k of llaves(token)) {
    const exactas = index.taxonomy.exact.get(k);
    if (exactas?.size) exact = true;
    exactas?.forEach((id) => ids.add(id));
    index.taxonomy.head.get(k)?.forEach((id) => ids.add(id));
  }
  return ids.size > 0 ? { ids: Array.from(ids), exact } : null;
}

export function buildCatalogTermIndex(
  types: { id?: string; name: string }[],
  categories: { id?: string; name: string; slug: string; typeId?: string }[],
): CatalogTermIndex {
  const keys = new Set(STATIC_KEYS);
  for (const t of types) for (const w of palabrasUtiles(t.name)) llaves(w).forEach((k) => keys.add(k));
  const cats: CatalogCategory[] = categories.map((c) => {
    const ck = new Set<string>();
    for (const w of palabrasUtiles(c.name)) {
      llaves(w).forEach((k) => {
        ck.add(k);
        keys.add(k);
      });
    }
    return { name: stripTaxonomyIcon(c.name), slug: c.slug, keys: ck };
  });
  return { keys, categories: cats, taxonomy: buildTaxonomy(types, categories) };
}

export const STATIC_TERM_INDEX: CatalogTermIndex = { keys: STATIC_KEYS, categories: [] };

/** Cinco minutos: una categoría nueva tarda eso en reconocerse, y no hay consulta por mensaje. */
export const CATALOG_TERMS_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; index: CatalogTermIndex }>();

export function resetCatalogTermCache(): void {
  cache.clear();
}

/**
 * Los términos de la tienda: tipos y categorías vivos, más los estáticos. Si
 * la base falla se sigue con los estáticos; el portero nunca tumba el mensaje.
 */
export async function loadCatalogTermIndex(
  storeId: string,
  now: number = Date.now(),
): Promise<CatalogTermIndex> {
  const hit = cache.get(storeId);
  if (hit && now - hit.at < CATALOG_TERMS_TTL_MS) return hit.index;
  try {
    const [types, categories] = await Promise.all([
      prismadb.type.findMany({ where: { storeId, isArchived: false }, select: { id: true, name: true } }),
      prismadb.category.findMany({
        where: { storeId, isArchived: false },
        select: { id: true, name: true, slug: true, typeId: true },
      }),
    ]);
    const index = buildCatalogTermIndex(types, categories);
    cache.set(storeId, { at: now, index });
    return index;
  } catch (error) {
    console.warn("[WHATSAPP_BOT] No se pudieron leer los términos del catálogo", {
      storeId,
      error: error instanceof Error ? error.message : String(error),
    });
    return STATIC_TERM_INDEX;
  }
}

export function isKnownTerm(index: CatalogTermIndex, token: string): boolean {
  return llaves(token).some((k) => index.keys.has(k));
}

// --- El mensaje entero ----------------------------------------------------------

/** Con más palabras que esto, un término suelto no basta: puede ser una conversación. */
export const MAX_TOKENS_FOR_TERM_GATE = 4;

export interface ParsedSearchIntent {
  price: PriceIntent | null;
  /** Las palabras que se buscan, ya sin cortesía ni precio. */
  tokens: string[];
  /** Las que son del catálogo. */
  knownTokens: string[];
  /** Todas son del catálogo: se puede buscar sin preguntarle al modelo. */
  allKnown: boolean;
  /** Agradece, cuenta o reclama algo: nombra un artículo, pero no lo está pidiendo. */
  conversational: boolean;
  /** Lo que se busca, como frase. */
  query: string;
}

/**
 * Relleno de WhatsApp que la lista de la tienda no trae («lo más barato que
 * tengan»). Va aquí y no en `search-terms`, que también filtra la tienda.
 */
const WHATSAPP_FILLER = new Set(["tengan", "tenga", "tengas", "tendran", "tendras", "vendan", "venda"]);

/**
 * «gracias por los stickers», «ya llegaron los cuadernos»: nombran algo del
 * catálogo y no lo piden. Con estas palabras el término suelto no abre la
 * puerta ni se busca sin el modelo; si hay una señal de pregunta, decide él.
 */
const CONVERSATION_MARKERS = new RegExp(
  `${antes}(?:gracias|ya|recib[ií]|recibimos|lleg[oó]|llegaron|pagu[eé]|pagamos|mand[eé]|envi[eé]|encant[oó]|encantaron|gust[oó]|gustaron|devolver|cambiar|reclamo|da[nñ]ad[oa]s?)${despues}`,
  "iu",
);

export function parseSearchIntent(body: string, index: CatalogTermIndex): ParsedSearchIntent {
  const { price, rest } = parsePriceIntent(body);
  const tokens = searchTokens(rest).filter((t) => !WHATSAPP_FILLER.has(stripAccents(t)));
  const knownTokens = tokens.filter((t) => isKnownTerm(index, t));
  return {
    price,
    tokens,
    knownTokens,
    allKnown: tokens.length > 0 && knownTokens.length === tokens.length,
    conversational: CONVERSATION_MARKERS.test(body),
    query: tokens.join(" "),
  };
}

/**
 * La segunda mitad del portero: sin verbo ni pregunta, el mensaje pasa si
 * nombra algo del catálogo y es corto («marcadores baratos», «resaltadores»),
 * o si además habla de precio. Ajustado a propósito: lo que pasa de aquí
 * llega al clasificador, que cuesta.
 */
export function looksLikeCatalogQuery(parsed: ParsedSearchIntent): boolean {
  if (parsed.knownTokens.length === 0 || parsed.conversational) return false;
  return parsed.tokens.length <= MAX_TOKENS_FOR_TERM_GATE || parsed.price !== null;
}

// --- Cuando no hay nada ---------------------------------------------------------

/** La tienda de producción: el enlace sale en un mensaje, nunca puede ser localhost. */
export const STORE_ORIGIN = "https://papeleriapdepapel.com";

export function storeSearchUrl(terms: string): string {
  return `${STORE_ORIGIN}/tienda?search=${encodeURIComponent(terms.trim())}`;
}

export function categoryUrl(slug: string): string {
  return `${STORE_ORIGIN}/categoria/${encodeURIComponent(slug)}`;
}

/**
 * La categoría que más palabras comparte con lo que se buscó, contando
 * sinónimos y familias: «plumones» encuentra «Marcadores». Null si ninguna.
 */
export function closestCategory(
  index: CatalogTermIndex,
  tokens: string[],
): CatalogCategory | null {
  let mejor: CatalogCategory | null = null;
  let puntos = 0;
  for (const cat of index.categories) {
    if (!cat.slug) continue;
    const p = tokens.filter((t) => tokenKeys(t).some((k) => cat.keys.has(k))).length;
    if (p > puntos) {
      mejor = cat;
      puntos = p;
    }
  }
  return mejor;
}

function tokenKeys(token: string): string[] {
  const formas = [token, ...nameForms(token), ...relatedTerms(token).filter((t) => !t.includes(" "))];
  return Array.from(new Set(formas.flatMap(llaves)));
}
