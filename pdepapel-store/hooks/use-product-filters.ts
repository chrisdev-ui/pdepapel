import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";

export function useProductFilters() {
  const [filters, setFilters] = useQueryStates(
    {
      typeId: parseAsArrayOf(parseAsString).withDefault([]),
      categoryId: parseAsArrayOf(parseAsString).withDefault([]),
      colorId: parseAsArrayOf(parseAsString).withDefault([]),
      sizeId: parseAsArrayOf(parseAsString).withDefault([]),
      designId: parseAsArrayOf(parseAsString).withDefault([]),
      minPrice: parseAsInteger,
      maxPrice: parseAsInteger,
      sortOption: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      search: parseAsString.withDefault(""),
    },
    {
      shallow: true,
    },
  );

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
