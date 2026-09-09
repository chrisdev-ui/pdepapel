import type { ProductFilters } from "@/hooks/use-product-filters";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { currencyFormatter } from "@/lib/utils";

export const PRICE_MIN = 0;
export const PRICE_MAX = 1_000_000;
export const PRICE_STEP = 1_000;

/** Mismos cortes que `PRICE_RANGE_BUCKETS` en el panel; `id` viaja en las facetas. */
export const PRICE_PRESETS = [
  { id: "[0,5000]", label: "Menos de $ 5.000", min: 0, max: 5_000 },
  { id: "[5000,10000]", label: "$ 5.000 – $ 10.000", min: 5_000, max: 10_000 },
  { id: "[10000,20000]", label: "$ 10.000 – $ 20.000", min: 10_000, max: 20_000 },
  { id: "[20000,50000]", label: "$ 20.000 – $ 50.000", min: 20_000, max: 50_000 },
  { id: "[50000,99999999]", label: "Más de $ 50.000", min: 50_000, max: PRICE_MAX },
] as const;

export type FilterListKey = "typeId" | "categoryId" | "colorId" | "sizeId" | "designId" | "optionValueId";

export const FILTER_LIST_KEYS: FilterListKey[] = ["typeId", "categoryId", "colorId", "sizeId", "designId", "optionValueId"];

export interface ActiveFilterChip {
  key: keyof ProductFilters;
  /** Valor a quitar; `null` para claves escalares (precio, ofertas, búsqueda). */
  value: string | null;
  label: string;
}

export interface FilterLookups {
  types?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
  colors?: { id: string; name: string }[];
  sizes?: { id: string; name: string }[];
  designs?: { id: string; name: string }[];
  optionValues?: { id: string; name: string }[];
}

const LOOKUP_BY_KEY: Record<FilterListKey, keyof FilterLookups> = {
  typeId: "types",
  categoryId: "categories",
  colorId: "colors",
  sizeId: "sizes",
  designId: "designs",
  optionValueId: "optionValues",
};

export function formatPriceRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${currencyFormatter.format(min)} – ${currencyFormatter.format(max)}`;
  if (min !== null) return `Desde ${currencyFormatter.format(min)}`;
  if (max !== null) return `Hasta ${currencyFormatter.format(max)}`;
  return "";
}

/** Cuántos filtros hay aplicados (cada valor de lista cuenta uno; precio, ofertas y búsqueda cuentan uno). */
export function countActiveFilters(filters: ProductFilters, ignore: (keyof ProductFilters)[] = []): number {
  let total = 0;
  for (const key of FILTER_LIST_KEYS) {
    if (ignore.includes(key)) continue;
    total += filters[key].length;
  }
  if (!ignore.includes("minPrice") && (filters.minPrice !== null || filters.maxPrice !== null)) total += 1;
  if (!ignore.includes("isOnSale") && filters.isOnSale) total += 1;
  if (!ignore.includes("search") && filters.search) total += 1;
  return total;
}

/** Chips de filtros activos en el orden en que se leen: búsqueda, listas, precio, ofertas. */
export function buildActiveFilterChips(
  filters: ProductFilters,
  lookups: FilterLookups,
  ignore: (keyof ProductFilters)[] = [],
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.search && !ignore.includes("search")) {
    chips.push({ key: "search", value: null, label: `Búsqueda: «${filters.search}»` });
  }
  for (const key of FILTER_LIST_KEYS) {
    if (ignore.includes(key)) continue;
    const items = lookups[LOOKUP_BY_KEY[key]] ?? [];
    for (const value of filters[key]) {
      const name = items.find((item) => item.id === value)?.name;
      if (name) chips.push({ key, value, label: stripTaxonomyIcon(name) });
    }
  }
  if (!ignore.includes("minPrice") && (filters.minPrice !== null || filters.maxPrice !== null)) {
    chips.push({ key: "minPrice", value: null, label: formatPriceRange(filters.minPrice, filters.maxPrice) });
  }
  if (filters.isOnSale && !ignore.includes("isOnSale")) {
    chips.push({ key: "isOnSale", value: null, label: "Solo ofertas" });
  }
  return chips;
}

/** Filtros sin el chip indicado, con la página reiniciada. */
export function removeFilterChip(filters: ProductFilters, chip: ActiveFilterChip): ProductFilters {
  const next: ProductFilters = { ...filters, page: 1 };
  if (chip.key === "minPrice") {
    next.minPrice = null;
    next.maxPrice = null;
  } else if (chip.key === "isOnSale") {
    next.isOnSale = false;
  } else if (chip.key === "search") {
    next.search = null;
    next.exact = false;
  } else if (chip.value !== null) {
    const key = chip.key as FilterListKey;
    next[key] = filters[key].filter((value) => value !== chip.value);
  }
  return next;
}

export const EMPTY_FILTERS: ProductFilters = {
  typeId: [],
  categoryId: [],
  colorId: [],
  sizeId: [],
  designId: [],
  optionValueId: [],
  minPrice: null,
  maxPrice: null,
  sortOption: null,
  page: 1,
  search: null,
  isOnSale: false,
  exact: false,
};

/** «Mostrando 1–24 de 1.980 productos». */
export function formatResultRange(page: number, perPage: number, total: number): string {
  if (total === 0) return "Sin productos";
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const totalLabel = total.toLocaleString("es-CO");
  return total === 1 ? "1 producto" : `Mostrando ${start}–${end} de ${totalLabel} productos`;
}

export function formatProductCount(total: number): string {
  return total === 1 ? "1 producto" : `${total.toLocaleString("es-CO")} productos`;
}

const TINTS = [
  { bg: "bg-kawaii-pink-light", blob: "#FFD6E5" },
  { bg: "bg-kawaii-blue-light", blob: "#D6E3FF" },
  { bg: "bg-kawaii-yellow-light", blob: "#FFF3CC" },
  { bg: "bg-kawaii-mint-light", blob: "#D6F5E9" },
  { bg: "bg-kawaii-lavender-light", blob: "#EEE2F7" },
  { bg: "bg-kawaii-peach", blob: "#FFE1D6" },
] as const;

/** Tono pastel estable por identificador, como la fila de categorías de la portada. */
export function tintForKey(key: string): (typeof TINTS)[number] {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return TINTS[hash % TINTS.length];
}
