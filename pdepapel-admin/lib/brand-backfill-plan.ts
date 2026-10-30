import { brandPhrase } from "@/lib/brand-phrase";

/**
 * Marca para los productos que no la tienen, sin escribir nada: el campo de
 * texto viejo (`Product.brand`) si nombra una marca de la tienda, si no la
 * única marca (o línea, o alias) que aparece palabra por palabra en el nombre.
 * Si el nombre trae dos marcas distintas, no se adivina: queda «ambiguo».
 *
 * Nunca propone «Genérica»: esa es una decisión de la publicación en Mercado
 * Libre (atributo BRAND, solo en categorías que la aceptan), no una marca de la
 * tienda que se vería en las fichas.
 */
export interface BackfillBrand {
  id: string;
  name: string;
  aliases: unknown;
  parentBrandId: string | null;
}

export interface BackfillProduct {
  id: string;
  name: string;
  brand: string | null;
  brandId: string | null;
  productGroupId: string | null;
}

export type BrandMatchSource = "campo-marca" | "nombre" | "alias";

export type BrandBackfillRow =
  | { productId: string; productGroupId: string | null; status: "match"; brandId: string; brandName: string; source: BrandMatchSource }
  | { productId: string; productGroupId: string | null; status: "ambiguous"; candidates: string[] }
  | { productId: string; productGroupId: string | null; status: "none" };

const MIN_PHRASE = 3;

function phrasesOf(brands: BackfillBrand[]) {
  const rows: { phrase: string; brand: BackfillBrand; source: BrandMatchSource }[] = [];
  for (const brand of brands) {
    rows.push({ phrase: brandPhrase(brand.name), brand, source: "nombre" });
    const aliases = Array.isArray(brand.aliases) ? brand.aliases : [];
    for (const alias of aliases) {
      if (typeof alias === "string" && alias.trim()) rows.push({ phrase: brandPhrase(alias), brand, source: "alias" });
    }
  }
  return rows.filter((row) => row.phrase.length >= MIN_PHRASE).sort((a, b) => b.phrase.length - a.phrase.length);
}

export function planBrandBackfill(products: BackfillProduct[], brands: BackfillBrand[]): BrandBackfillRow[] {
  const phrases = phrasesOf(brands);
  return products
    .filter((product) => !product.brandId)
    .map((product): BrandBackfillRow => {
      const base = { productId: product.id, productGroupId: product.productGroupId };
      if (product.brand) {
        const text = brandPhrase(product.brand);
        const exact = phrases.find((row) => row.phrase === text);
        if (exact) return { ...base, status: "match", brandId: exact.brand.id, brandName: exact.brand.name, source: "campo-marca" };
      }
      const name = ` ${brandPhrase(product.name)} `;
      const hits = phrases.filter((row) => name.includes(` ${row.phrase} `));
      const distinct = Array.from(new Set(hits.map((hit) => hit.brand.id)));
      if (distinct.length === 1) return { ...base, status: "match", brandId: hits[0].brand.id, brandName: hits[0].brand.name, source: hits[0].source };
      if (distinct.length > 1) return { ...base, status: "ambiguous", candidates: Array.from(new Set(hits.map((hit) => hit.brand.name))) };
      return { ...base, status: "none" };
    });
}

/**
 * Lo que se escribe, por marca. En un grupo la marca es una sola: si sus
 * variantes sin marca apuntan a marcas distintas, el grupo no se toca.
 */
export function groupBackfillByBrand(rows: BrandBackfillRow[]) {
  const byGroup = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.status !== "match" || !row.productGroupId) continue;
    const set = byGroup.get(row.productGroupId) ?? new Set<string>();
    set.add(row.brandId);
    byGroup.set(row.productGroupId, set);
  }
  const conflictingGroups = new Set(Array.from(byGroup.entries()).filter(([, ids]) => ids.size > 1).map(([groupId]) => groupId));
  const byBrand = new Map<string, string[]>();
  for (const row of rows) {
    if (row.status !== "match" || (row.productGroupId && conflictingGroups.has(row.productGroupId))) continue;
    byBrand.set(row.brandId, [...(byBrand.get(row.brandId) ?? []), row.productId]);
  }
  return { byBrand, conflictingGroups: Array.from(conflictingGroups) };
}
