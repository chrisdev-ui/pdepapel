export interface FacetCount {
  id: string;
  count: number;
}

export interface ProductFacets {
  colors: FacetCount[];
  formattedSizes: FacetCount[];
  categories: FacetCount[];
  designs: FacetCount[];
  /** Tipos (categorías padre), sumados desde las categorías. */
  types?: FacetCount[];
  /** Valores de opciones de catálogo (tamaño, hojas, etc.). */
  optionValues?: FacetCount[];
  /** Rangos de precio fijos de la tienda; `id` es la clave del preset. */
  priceRanges?: FacetCount[];
}

/** Mismos cortes que los presets del filtro de precio en la tienda. */
export const PRICE_RANGE_BUCKETS: { id: string; min: number; max: number | null }[] = [
  { id: "[0,5000]", min: 0, max: 5000 },
  { id: "[5000,10000]", min: 5000, max: 10000 },
  { id: "[10000,20000]", min: 10000, max: 20000 },
  { id: "[20000,50000]", min: 20000, max: 50000 },
  { id: "[50000,99999999]", min: 50000, max: null },
];

export function priceBucketWhere(bucket: { min: number; max: number | null }) {
  return bucket.max === null ? { gte: bucket.min } : { gte: bucket.min, lt: bucket.max };
}

/** Suma los conteos por categoría en conteos por tipo. */
export function typeFacetsFromCategories(
  categoryFacets: FacetCount[],
  categories: { id: string; typeId: string }[],
): FacetCount[] {
  const typeByCategory = new Map(categories.map((category) => [category.id, category.typeId]));
  const totals = new Map<string, number>();
  for (const facet of categoryFacets) {
    const typeId = typeByCategory.get(facet.id);
    if (!typeId) continue;
    totals.set(typeId, (totals.get(typeId) ?? 0) + facet.count);
  }
  return Array.from(totals, ([id, count]) => ({ id, count }));
}
