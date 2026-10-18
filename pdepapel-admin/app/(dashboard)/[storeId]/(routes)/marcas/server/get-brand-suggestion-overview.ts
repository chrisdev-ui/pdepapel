import { buildBrandMatcher } from "@/lib/brand-matcher";
import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";

export interface BrandSuggestionCount {
  brandId: string;
  /** Productos sin marca que la nombran (preseleccionados). */
  clean: number;
  /** Productos con otra marca que también la nombran. */
  conflicts: number;
}

export interface BrandSuggestionOverview {
  /** Productos activos sin marca. */
  unbranded: number;
  /** De esos, los que coinciden con alguna marca por nombre o alias. */
  unbrandedMatching: number;
  perBrand: BrandSuggestionCount[];
}

/**
 * Conteos de «Sugerencias automáticas» de todas las marcas sin archivar, con
 * una sola lectura de productos (la ruta de sugerencias va marca por marca).
 * Sigue la misma regla: productos activos cuyo nombre dice la marca o un alias.
 */
export async function getBrandSuggestionOverview(storeId: string): Promise<BrandSuggestionOverview> {
  await requireStoreRead(storeId);
  const [brands, products] = await Promise.all([
    prismadb.brand.findMany({
      where: { storeId, isArchived: false },
      select: { id: true, name: true, aliases: true },
    }),
    prismadb.product.findMany({
      where: { storeId, isArchived: false },
      select: { name: true, brandId: true },
    }),
  ]);
  const match = buildBrandMatcher(brands);
  const counts = new Map<string, BrandSuggestionCount>(
    brands.map((brand) => [brand.id, { brandId: brand.id, clean: 0, conflicts: 0 }]),
  );
  let unbranded = 0;
  let unbrandedMatching = 0;
  for (const product of products) {
    const hits = match(product.name);
    if (!product.brandId) {
      unbranded += 1;
      if (hits.length > 0) unbrandedMatching += 1;
    }
    for (const hit of hits) {
      if (hit.brandId === product.brandId) continue;
      const row = counts.get(hit.brandId);
      if (!row) continue;
      if (product.brandId) row.conflicts += 1;
      else row.clean += 1;
    }
  }
  return {
    unbranded,
    unbrandedMatching,
    perBrand: Array.from(counts.values()).filter((row) => row.clean + row.conflicts > 0),
  };
}
