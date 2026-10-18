import { brandKey, readStoredAliases } from "@/lib/brand-rules";

export interface MatchableBrand {
  id: string;
  name: string;
  aliases: unknown;
  /** Si es una línea, su marca madre: cuando el texto dice las dos, gana la línea (más específica). */
  parentBrandId?: string | null;
}

export interface BrandMatch {
  brandId: string;
  brandName: string;
  via: "name" | "alias";
  /** El texto que coincidió, tal como está escrito en la marca («Fashion»). */
  term: string;
}

interface Term {
  key: string;
  brandId: string;
  brandName: string;
  via: "name" | "alias";
  term: string;
}

/**
 * Busca marcas en un texto por su nombre o sus alias, como palabras completas
 * y sin importar tildes ni mayúsculas: «Morral FASHION» coincide con Klipp por
 * el alias «Fashion»; «Normandía» no coincide con Norma. Si el texto dice una
 * línea y su marca madre («Colores Scribe Incolors»), queda solo la línea.
 */
export function buildBrandMatcher(brands: MatchableBrand[]) {
  const parentOf = new Map(brands.map((brand) => [brand.id, brand.parentBrandId ?? null]));
  const terms: Term[] = [];
  for (const brand of brands) {
    const nameKey = brandKey(brand.name);
    if (nameKey) terms.push({ key: nameKey, brandId: brand.id, brandName: brand.name, via: "name", term: brand.name });
    for (const alias of readStoredAliases(brand.aliases)) {
      const key = brandKey(alias);
      if (key) terms.push({ key, brandId: brand.id, brandName: brand.name, via: "alias", term: alias });
    }
  }

  return function matchBrands(text: string | null | undefined): BrandMatch[] {
    if (!text) return [];
    const haystack = ` ${brandKey(text)} `;
    const byBrand = new Map<string, BrandMatch>();
    for (const term of terms) {
      if (!haystack.includes(` ${term.key} `)) continue;
      const current = byBrand.get(term.brandId);
      if (current && current.via === "name") continue;
      byBrand.set(term.brandId, { brandId: term.brandId, brandName: term.brandName, via: term.via, term: term.term });
    }
    return preferLines(Array.from(byBrand.values()), parentOf);
  };
}

/** Quita la marca madre cuando también coincidió una de sus líneas. */
export function preferLines<T extends { brandId: string }>(matches: T[], parentOf: Map<string, string | null>): T[] {
  const parentsWithLineHit = new Set(
    matches.map((match) => parentOf.get(match.brandId)).filter((parent): parent is string => Boolean(parent)),
  );
  return matches.filter((match) => !parentsWithLineHit.has(match.brandId));
}

/** La única marca sugerida por el texto, o null si no hay ninguna o hay más de una. */
export function singleBrandMatch(matches: BrandMatch[]) {
  return matches.length === 1 ? matches[0] : null;
}

export function describeBrandMatch(match: Pick<BrandMatch, "via" | "term">) {
  return match.via === "alias" ? `coincide por el alias «${match.term}»` : "coincide por el nombre";
}
