import { placeLinesAfterParents } from "@/lib/brand-rules";

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
  /** Marcas que se muestran en la tienda; `id` es el slug. Sin las de 0. */
  brands?: BrandFacetCount[];
}

export interface BrandFacetCount extends FacetCount {
  name: string;
  logoUrl: string | null;
  logoHasBackground: boolean;
  logoPermission: "UNKNOWN" | "ALLOWED" | "PENDING" | "DENIED";
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

/** Una variante o producto suelto, con lo necesario para contar tarjetas. */
export interface FacetRow {
  id: string;
  productGroupId: string | null;
  categoryId: string;
  colorId: string;
  sizeId: string;
  designId: string;
  brandId?: string | null;
  optionValues: { optionId: string; optionValueId: string }[];
  /** Precio con ofertas: el que ve la clienta. */
  effectivePrice: number;
  hasDiscount: boolean;
}

export interface FacetSelection {
  /** `undefined` = sin filtro de categoría; vacío = nada coincide. */
  categoryScope?: string[];
  colorIds: string[];
  sizeIds: string[];
  designIds: string[];
  /** Marcas elegidas (ids ya resueltos desde los slugs). */
  brandIds?: string[];
  optionValuesByOption: Map<string, string[]>;
  minPrice?: number;
  maxPrice?: number;
  isOnSale: boolean;
}

type FacetDimension = "category" | "color" | "size" | "design" | "brand" | "option" | "price";

/** Rango de precio semiabierto `[min, max)`, igual que los rangos fijos. */
export function priceInRange(price: number, minPrice?: number, maxPrice?: number) {
  return (minPrice === undefined || price >= minPrice) && (maxPrice === undefined || price < maxPrice);
}

function passes(row: FacetRow, selection: FacetSelection, except: FacetDimension) {
  if (except !== "category" && selection.categoryScope && !selection.categoryScope.includes(row.categoryId)) return false;
  if (except !== "color" && selection.colorIds.length > 0 && !selection.colorIds.includes(row.colorId)) return false;
  if (except !== "size" && selection.sizeIds.length > 0 && !selection.sizeIds.includes(row.sizeId)) return false;
  if (except !== "design" && selection.designIds.length > 0 && !selection.designIds.includes(row.designId)) return false;
  if (except !== "brand" && selection.brandIds && selection.brandIds.length > 0 && !(row.brandId && selection.brandIds.includes(row.brandId))) return false;
  if (except !== "option") {
    for (const [optionId, valueIds] of Array.from(selection.optionValuesByOption)) {
      if (!row.optionValues.some((value) => value.optionId === optionId && valueIds.includes(value.optionValueId))) return false;
    }
  }
  if (except !== "price" && !priceInRange(row.effectivePrice, selection.minPrice, selection.maxPrice)) return false;
  if (selection.isOnSale && !row.hasDiscount) return false;
  return true;
}

const cardKey = (row: FacetRow) => row.productGroupId ?? row.id;

function countCards(rows: FacetRow[], keyOf: (row: FacetRow) => string[]): FacetCount[] {
  const cards = new Map<string, Set<string>>();
  for (const row of rows) {
    for (const key of keyOf(row)) {
      const set = cards.get(key) ?? new Set<string>();
      set.add(cardKey(row));
      cards.set(key, set);
    }
  }
  return Array.from(cards, ([id, set]) => ({ id, count: set.size }));
}

/**
 * Conteos por tarjeta (un grupo cuenta una vez), con todos los demás filtros
 * aplicados, para que el número junto a cada valor sea lo que se ve al
 * elegirlo.
 */
export function computeCardFacets(
  rows: FacetRow[],
  selection: FacetSelection,
  categories: { id: string; typeId: string }[],
  /** Línea → marca madre: un producto de Flower Power cuenta también para Primavera. */
  brandParents: Map<string, string> = new Map(),
): ProductFacets & { brandIds: FacetCount[] } {
  const typeByCategory = new Map(categories.map((category) => [category.id, category.typeId]));
  const without = (except: FacetDimension) => rows.filter((row) => passes(row, selection, except));
  const byCategory = without("category");
  const byPrice = without("price");
  return {
    colors: countCards(without("color"), (row) => [row.colorId]),
    formattedSizes: countCards(without("size"), (row) => [row.sizeId]),
    categories: countCards(byCategory, (row) => [row.categoryId]),
    designs: countCards(without("design"), (row) => [row.designId]),
    types: countCards(byCategory, (row) => {
      const typeId = typeByCategory.get(row.categoryId);
      return typeId ? [typeId] : [];
    }),
    optionValues: countCards(without("option"), (row) => row.optionValues.map((value) => value.optionValueId)),
    brandIds: countCards(without("brand"), (row) => {
      if (!row.brandId) return [];
      const parent = brandParents.get(row.brandId);
      return parent ? [row.brandId, parent] : [row.brandId];
    }),
    priceRanges: PRICE_RANGE_BUCKETS.map((bucket) => ({
      id: bucket.id,
      count: new Set(
        byPrice.filter((row) => priceInRange(row.effectivePrice, bucket.min, bucket.max ?? undefined)).map(cardKey),
      ).size,
    })),
  };
}

/**
 * Conteos por marca con la forma de la tienda: solo marcas públicas, sin las
 * de 0 y en el orden del panel. `brands` trae las marcas públicas de la tienda.
 */
export function toBrandFacets(
  counts: FacetCount[],
  brands: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    logoHasBackground: boolean;
    logoPermission: BrandFacetCount["logoPermission"];
    sortOrder: number;
    parentBrandId?: string | null;
  }[],
): BrandFacetCount[] {
  const countById = new Map(counts.map((facet) => [facet.id, facet.count]));
  const sorted = brands
    .filter((brand) => (countById.get(brand.id) ?? 0) > 0)
    .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name, "es"));
  return placeLinesAfterParents(sorted)
    .map((brand) => ({
      id: brand.slug,
      count: countById.get(brand.id) ?? 0,
      name: brand.name,
      logoUrl: brand.logoUrl,
      logoHasBackground: brand.logoHasBackground,
      logoPermission: brand.logoPermission,
    }));
}
