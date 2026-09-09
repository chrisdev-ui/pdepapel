import prismadb from "@/lib/prismadb";
import { normalizeSearchTerm } from "@/lib/search-terms";

/**
 * «¿Quisiste decir…?»: cuando una búsqueda no encuentra nada, se corrige cada
 * palabra desconocida por la más parecida del vocabulario de la tienda
 * (nombres de productos, grupos y categorías). MySQL no tolera errores de
 * escritura; esto lo resuelve sin un buscador externo.
 */

export type Vocabulary = Map<string, number>;

const MIN_WORD_LENGTH = 4;
const VOCAB_CACHE_SECONDS = 60 * 60;

export const foldWord = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-CO");

export function tokenize(text: string): string[] {
  return foldWord(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length >= MIN_WORD_LENGTH);
}

export function buildVocabulary(names: string[]): Vocabulary {
  const vocabulary: Vocabulary = new Map();
  for (const name of names) {
    for (const word of tokenize(name)) vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
  }
  return vocabulary;
}

/** Distancia de Damerau-Levenshtein (inserción, borrado, sustitución, transposición). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const maxDistanceFor = (word: string) => (word.length <= 5 ? 1 : 2);

/** La palabra del vocabulario más cercana, o null si ninguna está lo bastante cerca. */
export function closestWord(word: string, vocabulary: Vocabulary): string | null {
  if (vocabulary.has(word)) return word;
  const limit = maxDistanceFor(word);
  let best: { word: string; distance: number; frequency: number } | null = null;
  vocabulary.forEach((frequency, candidate) => {
    if (Math.abs(candidate.length - word.length) > limit) return;
    if (candidate[0] !== word[0] && candidate[1] !== word[1]) return;
    const distance = editDistance(word, candidate);
    if (distance > limit) return;
    if (!best || distance < best.distance || (distance === best.distance && frequency > best.frequency)) best = { word: candidate, distance, frequency };
  });
  return best ? (best as { word: string }).word : null;
}

/**
 * Consulta corregida palabra a palabra; null si no hay nada que corregir o
 * si alguna palabra no tiene reemplazo (mejor un vacío honesto que un
 * resultado inventado).
 */
export function suggestQuery(query: string, vocabulary: Vocabulary): string | null {
  const words = normalizeSearchTerm(query).split(" ").filter(Boolean);
  if (words.length === 0) return null;
  let changed = false;
  const corrected: string[] = [];
  for (const word of words) {
    const folded = foldWord(word);
    if (folded.length < MIN_WORD_LENGTH || vocabulary.has(folded)) {
      corrected.push(word);
      continue;
    }
    const replacement = closestWord(folded, vocabulary);
    if (!replacement) return null;
    corrected.push(replacement);
    changed = true;
  }
  return changed ? corrected.join(" ") : null;
}

/** Vocabulario de la tienda, cacheado una hora en Redis cuando está disponible. */
export async function getStoreVocabulary(storeId: string): Promise<Vocabulary> {
  const cacheKey = `store:${storeId}:search-vocabulary:v1`;
  let redis: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown, options: { ex: number }) => Promise<unknown> } | null = null;
  try {
    const { Redis } = await import("@upstash/redis");
    redis = Redis.fromEnv();
    const cached = (await redis.get(cacheKey)) as [string, number][] | null;
    if (Array.isArray(cached)) return new Map(cached);
  } catch {
    redis = null;
  }

  const [products, groups, categories] = await Promise.all([
    prismadb.product.findMany({ where: { storeId, isArchived: false }, select: { name: true } }),
    prismadb.productGroup.findMany({ where: { storeId }, select: { name: true } }),
    prismadb.category.findMany({ where: { storeId }, select: { name: true } }),
  ]);
  const vocabulary = buildVocabulary([...products, ...groups, ...categories].map((row) => row.name));

  try {
    const entries: [string, number][] = [];
    vocabulary.forEach((frequency, word) => entries.push([word, frequency]));
    await redis?.set(cacheKey, entries, { ex: VOCAB_CACHE_SECONDS });
  } catch {
    // Sin caché: se recalcula en la próxima búsqueda vacía.
  }
  return vocabulary;
}
