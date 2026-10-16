// Sin dependencias de servidor: el mapa se arma en el servidor y la ficha solo lo consulta.
import { DEFAULT_MARKUP_PCT, landedCost, markupOf } from "./price-calculator";

/** Con menos productos que esto, la mediana de la categoría no se usa y se sube al tipo. */
export const MIN_MARKUP_SAMPLE = 5;

export interface MarkupSampleProduct {
  categoryId: string | null;
  price: number;
  acqPrice: number | null;
  transportationCost: number | null;
  isKit: boolean;
}

export interface MarkupCategory {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  markupOverridePercent: number | null;
}

export type MarkupSourceKind = "propio" | "categoria" | "tipo" | "tienda" | "defecto";

export interface ResolvedMarkup {
  markupPct: number;
  kind: MarkupSourceKind;
  /** Para la ficha y la respuesta: «mediana de Cuadernos (12 productos)». */
  source: string;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const productsLabel = (count: number) => `${count} ${count === 1 ? "producto" : "productos"}`;

/**
 * El aumento de un producto activo para la mediana: precio / (costo + envío) − 1.
 * Sin costo, por debajo del costo o kit (su costo es el de sus piezas): no cuenta.
 */
export function sampleMarkup(product: MarkupSampleProduct): number | null {
  if (product.isKit) return null;
  const cost = landedCost(product.acqPrice, product.transportationCost);
  if (cost === null || !(product.price > cost)) return null;
  return markupOf(product.price, cost);
}

/**
 * Aumento sugerido por categoría. Gana el que definió Paula para la categoría;
 * si no, la mediana de sus productos activos (con al menos 5), luego la del
 * tipo al que pertenece, luego la de toda la tienda y, sin ningún producto con
 * costo, el 100 % de siempre. La ficha y el Copiloto usan exactamente esto.
 */
export function buildMarkupResolver(products: readonly MarkupSampleProduct[], categories: readonly MarkupCategory[]) {
  const byCategory = new Map<string, number[]>();
  const byType = new Map<string, number[]>();
  const all: number[] = [];
  const typeOf = new Map(categories.map((category) => [category.id, category.typeId]));
  for (const product of products) {
    const markup = sampleMarkup(product);
    if (markup === null) continue;
    all.push(markup);
    if (!product.categoryId) continue;
    byCategory.set(product.categoryId, [...(byCategory.get(product.categoryId) ?? []), markup]);
    const typeId = typeOf.get(product.categoryId);
    if (typeId) byType.set(typeId, [...(byType.get(typeId) ?? []), markup]);
  }
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const storeLevel = (): ResolvedMarkup => {
    const value = median(all);
    return value === null
      ? { markupPct: DEFAULT_MARKUP_PCT, kind: "defecto", source: `${DEFAULT_MARKUP_PCT} % por defecto (no hay productos con costo para comparar)` }
      : { markupPct: round1(value), kind: "tienda", source: `mediana de la tienda (${productsLabel(all.length)})` };
  };

  return (categoryId: string | null | undefined): ResolvedMarkup => {
    const category = categoryId ? categoryById.get(categoryId) : undefined;
    if (!category) return storeLevel();
    if (typeof category.markupOverridePercent === "number" && Number.isFinite(category.markupOverridePercent)) {
      return { markupPct: round1(category.markupOverridePercent), kind: "propio", source: `definido por ti para ${category.name}` };
    }
    const own = byCategory.get(category.id) ?? [];
    if (own.length >= MIN_MARKUP_SAMPLE) {
      return { markupPct: round1(median(own)!), kind: "categoria", source: `mediana de ${category.name} (${productsLabel(own.length)})` };
    }
    const siblings = byType.get(category.typeId) ?? [];
    if (siblings.length >= MIN_MARKUP_SAMPLE) {
      return {
        markupPct: round1(median(siblings)!),
        kind: "tipo",
        source: `mediana de ${category.typeName} (${productsLabel(siblings.length)}; ${category.name} tiene menos de ${MIN_MARKUP_SAMPLE})`,
      };
    }
    const store = storeLevel();
    return store.kind === "tienda" ? { ...store, source: `${store.source}; ${category.name} y ${category.typeName} tienen menos de ${MIN_MARKUP_SAMPLE}` } : store;
  };
}

/** El mapa que viaja a la ficha: una entrada por categoría más la de «sin categoría». */
export function markupMap(products: readonly MarkupSampleProduct[], categories: readonly MarkupCategory[]) {
  const resolve = buildMarkupResolver(products, categories);
  return {
    byCategory: Object.fromEntries(categories.map((category) => [category.id, resolve(category.id)])) as Record<string, ResolvedMarkup>,
    fallback: resolve(null),
  };
}

export type MarkupMap = ReturnType<typeof markupMap>;
