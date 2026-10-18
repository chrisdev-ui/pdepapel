import { brandKey, readStoredAliases } from "@/lib/brand-rules";

export interface MatchableBrand {
  id: string;
  name: string;
  aliases: unknown;
}

export interface BrandMatch {
  brandId: string;
  brandName: string;
  via: "name" | "alias";
  /** El texto que coincidió, tal como está escrito en la marca («Incolors»). */
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
 * y sin importar tildes ni mayúsculas: «Cuaderno INCOLORS 50 h» coincide con
 * Scribe por el alias «Incolors»; «Normandía» no coincide con Norma.
 */
export function buildBrandMatcher(brands: MatchableBrand[]) {
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
    return Array.from(byBrand.values());
  };
}

/** La única marca sugerida por el texto, o null si no hay ninguna o hay más de una. */
export function singleBrandMatch(matches: BrandMatch[]) {
  return matches.length === 1 ? matches[0] : null;
}

export function describeBrandMatch(match: Pick<BrandMatch, "via" | "term">) {
  return match.via === "alias" ? `coincide por el alias «${match.term}»` : "coincide por el nombre";
}
