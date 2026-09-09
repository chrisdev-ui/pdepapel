"use client";

import { createContext, ReactNode, useContext } from "react";

import { ProductFilters, useProductFilters } from "@/hooks/use-product-filters";

export interface FilterState {
  filters: ProductFilters;
  setFilter: (key: keyof ProductFilters, value: unknown) => void;
  toggleFilter: (key: keyof ProductFilters, value: string) => void;
  setFilters: (update: ProductFilters | ((previous: ProductFilters) => ProductFilters)) => void;
}

const FilterStateContext = createContext<FilterState | null>(null);

/**
 * Los controles de filtro leen de aquí. Sin proveedor escriben en la URL
 * (barra lateral de escritorio); la hoja móvil envuelve sus controles con un
 * estado pendiente que solo llega a la URL al tocar «Ver N productos».
 */
export function FilterStateProvider({ value, children }: { value: FilterState; children: ReactNode }) {
  return <FilterStateContext.Provider value={value}>{children}</FilterStateContext.Provider>;
}

export function useFilterState(): FilterState {
  const pending = useContext(FilterStateContext);
  const url = useProductFilters();
  if (pending) return pending;
  return {
    filters: url.filters,
    setFilter: url.setFilter,
    toggleFilter: url.toggleFilter,
    setFilters: (update) => url.setFilters(update as never),
  };
}

/** Estado pendiente en memoria con la misma interfaz que el de la URL. */
export function createPendingFilterState(
  filters: ProductFilters,
  update: (next: ProductFilters) => void,
): FilterState {
  const apply = (next: ProductFilters) => update({ ...next, page: 1 });
  return {
    filters,
    setFilter: (key, value) => apply({ ...filters, [key]: value }),
    toggleFilter: (key, value) => {
      const current = (filters[key] as string[]) ?? [];
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      apply({ ...filters, [key]: next });
    },
    setFilters: (updater) => apply(typeof updater === "function" ? updater(filters) : updater),
  };
}
