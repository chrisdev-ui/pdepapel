/**
 * Búsqueda de ciudades por palabras: «medellin antioquia», «cali, valle» o
 * «Bogotá DC» encuentran su ciudad aunque escriban también el departamento.
 * La misma regla vive en la administración (`pdepapel-admin/lib/dane-search.ts`);
 * si cambia aquí, cambia allá en el mismo despliegue.
 */

export interface SearchableLocation {
  city: string;
  department: string;
}

/** Nombres que la gente escribe y que no son el nombre oficial del DANE. */
const QUERY_ALIASES: Array<[RegExp, string]> = [
  [/\bcartagena de indias\b/g, "cartagena"],
  [/\bsanta ?fe de bogota\b/g, "bogota"],
  [/\bbogota distrito capital\b/g, "bogota"],
  [/\bd\s*\.?\s*c\b\.?/g, " "],
];

const STOPWORDS = new Set(["de", "del", "la", "el", "las", "los", "y"]);

export function normalizeLocationText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyAliases(normalized: string): string {
  let text = ` ${normalized} `;
  for (const [pattern, replacement] of QUERY_ALIASES) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Palabras con las que se filtra: sin tildes, sin «de», sin «D.C.». */
export function locationSearchTokens(query: string | null | undefined): string[] {
  const text = applyAliases(normalizeLocationText(query ?? ""));
  return text.split(" ").filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** La palabra más larga: la que se manda a la administración cuando hay varias. */
export function longestLocationToken(tokens: string[]): string | undefined {
  return [...tokens].sort((a, b) => b.length - a.length)[0];
}

/** Ciudad sin «D.C.» ni puntuación: «BOGOTÁ D.C.» → «bogota». */
export function cityKey(city: string): string {
  return locationSearchTokens(city).join(" ");
}

export function matchesLocationTokens(location: SearchableLocation, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = normalizeLocationText(`${location.city} ${location.department}`);
  return tokens.every((token) => haystack.includes(token));
}

/** Coincidencia exacta de ciudad primero, luego las que empiezan igual, luego alfabético. */
export function rankLocations<T extends SearchableLocation>(locations: T[], tokens: string[]): T[] {
  const query = tokens.join(" ");
  const first = tokens[0] ?? "";
  const score = (location: T) => {
    const key = cityKey(location.city);
    if (key === query || (tokens.length > 1 && key === first)) return 0;
    if (key.startsWith(first)) return 1;
    return 2;
  };
  return [...locations].sort((a, b) => score(a) - score(b) || a.city.localeCompare(b.city, "es"));
}

export function filterLocations<T extends SearchableLocation>(locations: T[], query: string | null | undefined): T[] {
  const tokens = locationSearchTokens(query);
  if (tokens.length === 0) return locations;
  return rankLocations(
    locations.filter((location) => matchesLocationTokens(location, tokens)),
    tokens,
  );
}

/**
 * La única opción cuya ciudad es exactamente lo escrito («Medellín» →
 * MEDELLÍN, ANTIOQUIA); si escribió también el departamento, debe coincidir.
 * `undefined` si no hay una sola (p. ej. «Mosquera»: Cundinamarca y Nariño).
 */
export function findExactLocation<T extends SearchableLocation>(locations: T[], query: string | null | undefined): T | undefined {
  const tokens = locationSearchTokens(query);
  if (tokens.length === 0) return undefined;
  const typed = tokens.join(" ");
  const exact = locations.filter((location) => {
    const key = cityKey(location.city);
    if (key === typed) return true;
    if (!typed.startsWith(`${key} `)) return false;
    const rest = typed.slice(key.length + 1).split(" ");
    return matchesLocationTokens({ city: "", department: location.department }, rest);
  });
  return exact.length === 1 ? exact[0] : undefined;
}
