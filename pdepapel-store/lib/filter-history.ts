import type { ProductFilters } from "@/hooks/use-product-filters";

/** Tipo, subcategoría y página son navegaciones que «Atrás» debe deshacer; el resto de ajustes no. */
const NAVIGATION_KEYS = ["typeId", "categoryId"] as const;

const sameSet = (a: unknown, b: unknown) => {
  const left = Array.isArray(a) ? [...a].sort().join("|") : "";
  const right = Array.isArray(b) ? [...b].sort().join("|") : "";
  return left === right;
};

const sameValue = (a: unknown, b: unknown) => {
  if (Array.isArray(a) || Array.isArray(b)) return sameSet(a, b);
  return (a ?? null) === (b ?? null) || (!a && !b);
};

export function filterHistoryMode(previous: ProductFilters, next: Partial<ProductFilters>): "push" | "replace" {
  if (NAVIGATION_KEYS.some((key) => key in next && !sameSet(previous[key], next[key]))) return "push";
  const changed = (Object.keys(next) as (keyof ProductFilters)[]).filter((key) => !sameValue(previous[key], next[key]));
  return changed.length === 1 && changed[0] === "page" ? "push" : "replace";
}
