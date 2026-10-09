import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";

import { filterHistoryMode } from "@/lib/filter-history";

const filterParsers = {
  typeId: parseAsArrayOf(parseAsString).withDefault([]),
  categoryId: parseAsArrayOf(parseAsString).withDefault([]),
  colorId: parseAsArrayOf(parseAsString).withDefault([]),
  sizeId: parseAsArrayOf(parseAsString).withDefault([]),
  designId: parseAsArrayOf(parseAsString).withDefault([]),
  optionValueId: parseAsArrayOf(parseAsString).withDefault([]),
  minPrice: parseAsInteger,
  maxPrice: parseAsInteger,
  sortOption: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  search: parseAsString.withDefault(""),
  isOnSale: parseAsBoolean.withDefault(false),
  /** Buscar el texto tal cual, sin corrección ortográfica. */
  exact: parseAsBoolean.withDefault(false),
};

export interface ProductFilters {
  typeId: string[];
  categoryId: string[];
  colorId: string[];
  sizeId: string[];
  designId: string[];
  optionValueId: string[];
  minPrice: number | null;
  maxPrice: number | null;
  sortOption: string | null;
  page: number;
  search: string | null;
  isOnSale: boolean;
  exact: boolean;
}

export function useProductFilters() {
  const [filters, setRawFilters] = useQueryStates(filterParsers, {
    shallow: true,
  });

  type Update = Partial<ProductFilters> | ((previous: ProductFilters) => Partial<ProductFilters>);
  const setFilters = (update: Update) => {
    const current = filters as ProductFilters;
    const next = typeof update === "function" ? update(current) : update;
    return setRawFilters(update as never, { history: filterHistoryMode(current, next) });
  };

  const setFilter = (key: keyof typeof filters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset page on filter change
    }));
  };

  const toggleFilter = (key: keyof typeof filters, value: string) => {
    const currentValues = (filters[key] as string[]) || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];

    setFilters((prev) => ({
      ...prev,
      [key]: newValues.length > 0 ? newValues : null,
      page: 1,
    }));
  };

  return {
    filters,
    setFilter,
    toggleFilter,
    setFilters,
  };
}
