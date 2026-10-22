/**
 * Encontrar el producto que Paula nombra como lo diría ella («los marcadores
 * en estuche cuadrado x50»), no como está escrito en la ficha. Puro: recibe
 * los candidatos ya leídos de la base y decide.
 */
const STOPWORDS = new Set([
  "de", "del", "en", "con", "para", "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "al", "a", "por", "que", "mi", "me",
  // Palabras del pedido, no del producto («hazme la descripción de…»).
  "haz", "hazme", "escribe", "escribeme", "mejora", "mejorame", "descripcion", "ficha", "texto", "tienda", "quiero", "necesito",
]);

export const foldText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** «x50», «x 50», «por 50», «50 unidades», «50 colores» → «50». */
export function normalizeQuantities(value: string): string {
  return value
    .replace(/\bx\s*(\d+)\b/g, " $1 ")
    .replace(/\bpor\s+(\d+)\b/g, " $1 ")
    .replace(/\b(\d+)\s*(?:unidades|unidad|und|uds|colores|piezas|pcs)\b/g, " $1 ");
}

/** Lo que tiene forma de SKU de la tienda (p. ej. MAR-SIM-MUL-L-L-6315). */
export function skuLikeTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter((word) => /^[a-z0-9]{2,8}(?:-[a-z0-9]{1,8}){2,7}$/i.test(word))
    .map((word) => word.toUpperCase());
}

/** Plural sencillo: marcadores → marcador, estuches → estuche, colores → color. */
export function singular(word: string): string {
  if (/\d/.test(word)) return word;
  if (word.length > 4 && /[rnldz]es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** Como lo dice Paula → como está en el catálogo. */
const SYNONYMS: Record<string, string> = { cosedora: "grapadora" };

export function matchTokens(value: string): string[] {
  const words = normalizeQuantities(foldText(value))
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word && !STOPWORDS.has(word) && (word.length > 1 || /\d/.test(word)));
  return Array.from(new Set(words.map(singular).map((word) => SYNONYMS[word] ?? word)));
}

export interface MatchCandidate {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  group: string | null;
  soldCount?: number;
}

export type MatchDecision<T extends MatchCandidate> =
  | { kind: "match"; product: T }
  | { kind: "ambiguous"; candidates: T[] }
  | { kind: "none"; closest: T[] };

const MAX_CANDIDATES = 5;

export function rankCandidates<T extends MatchCandidate>(query: string, products: T[]) {
  const wanted = matchTokens(query);
  const wantedNumbers = wanted.filter((token) => /^\d+$/.test(token));
  return products
    .map((product) => {
      const have = new Set(matchTokens([product.name, product.sku ?? "", product.category ?? "", product.group ?? ""].join(" ")));
      const haveNumbers = Array.from(have).filter((token) => /^\d+$/.test(token));
      // «x50» contra un set de 12: la cantidad lo contradice y baja.
      const contradicts = wantedNumbers.length > 0 && haveNumbers.length > 0 && !wantedNumbers.some((token) => have.has(token));
      const matched = wanted.filter((token) => have.has(token)).length;
      return { product, matched, score: matched - (contradicts ? 1 : 0), numbersOk: wantedNumbers.every((token) => have.has(token)) };
    })
    .filter((row) => row.matched > 0)
    .sort((a, b) => b.score - a.score || (b.product.soldCount ?? 0) - (a.product.soldCount ?? 0));
}

/**
 * Una coincidencia clara (al menos 60 % de las palabras, con la cantidad si se
 * dijo, y sin empate arriba) se usa. Un empate arriba se pregunta. Si no
 * alcanza, se muestran las 3 más parecidas.
 */
export function decideProduct<T extends MatchCandidate>(query: string, products: T[]): MatchDecision<T> {
  const wanted = matchTokens(query);
  const ranked = rankCandidates(query, products);
  if (!wanted.length || !ranked.length) return { kind: "none", closest: [] };
  const top = ranked[0];
  const needed = Math.max(1, Math.ceil(wanted.length * 0.6));
  if (top.score < needed || !top.numbersOk) return { kind: "none", closest: ranked.slice(0, 3).map((row) => row.product) };
  const tied = ranked.filter((row) => row.score === top.score && row.numbersOk);
  if (tied.length === 1) return { kind: "match", product: top.product };
  // Paula contesta con el nombre que le mostramos: si uno de los empatados se llama exactamente así, es ese.
  const exact = tied.filter((row) => foldText(row.product.name).trim() === foldText(query).trim());
  if (exact.length === 1) return { kind: "match", product: exact[0].product };
  return { kind: "ambiguous", candidates: tied.slice(0, MAX_CANDIDATES).map((row) => row.product) };
}

/**
 * Cuántos datos concretos hay para escribir una descripción, por familia
 * (marca, cantidad, medidas, punta, tinta, material, presentación, colores,
 * contenido del kit y hasta dos usos). Con menos de 4 se pregunta antes de
 * escribir: así la decisión no depende de cómo cuente el modelo.
 */
export const MIN_FACTS_TO_WRITE = 4;

const FACT_FAMILIES: RegExp[] = [
  /\b\d+(?:[.,]\d+)?\s?(?:x\s?\d+(?:[.,]\d+)?\s?)?(?:mm|cm|ml|gr|kg|g|m|hojas|paginas|pliegos)\b/,
  // «x24» es cantidad; «20 x 8 cm» es una medida, no cuenta aquí.
  /\bx\s?\d+\b(?!\s?(?:x|\d|mm|cm|ml|m|g|gr|kg)\b)|\b\d+\s?(?:unidades|colores|piezas|marcadores|lapiceros|plumones|plumigrafos|lapices|rollos|stickers|tonos)\b/,
  /\bpunta\b/,
  /\btinta\b/,
  /\b(?:tela|plastic\w*|metal\w*|madera|carton|papel|silicona|acrilic\w*|cuero|vinilo|algodon|resina|goma)\b/,
  /\b(?:estuche|caja|blister|bolsa|cierre|compartimento\w*|tapa\w*|argollad\w*|espiral)\b/,
  /\b(?:rosa\w*|azul\w*|verde\w*|amarill\w*|negr\w*|blanc\w*|roj\w*|morad\w*|lila\w*|pastel\w*|neon|metalizad\w*|dorad\w*|platead\w*|multicolor)\b/,
];

export function countConcreteFacts(input: { texts: (string | null | undefined)[]; brand?: string | null; kitPieces?: number }): number {
  const text = foldText(input.texts.filter(Boolean).join(" \n "));
  const families = FACT_FAMILIES.filter((pattern) => pattern.test(text)).length;
  const uses = Math.min(2, (text.match(/\bpara\s+(?:(?:el|la|los|las|un|una|tu|tus)\s+)?(?!que\b)[a-z]{4,}/g) ?? []).length);
  return families + uses + (input.brand?.trim() ? 1 : 0) + ((input.kitPieces ?? 0) > 0 ? 1 : 0);
}
