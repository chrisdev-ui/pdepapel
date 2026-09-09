"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getProducts } from "@/actions/get-products";
import type { ProductFilters } from "@/hooks/use-product-filters";

const join = (values: string[]) => (values.length ? values.join(",") : undefined);

/** Parámetros de la API para un conjunto de filtros; una categoría fija manda sobre la URL. */
export function filtersToQuery(filters: ProductFilters, fixedCategoryId?: string) {
  return {
    typeId: fixedCategoryId ? undefined : join(filters.typeId),
    categoryId: fixedCategoryId ?? join(filters.categoryId),
    colorId: join(filters.colorId),
    sizeId: join(filters.sizeId),
    designId: join(filters.designId),
    optionValueId: join(filters.optionValueId),
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    search: filters.search || undefined,
    exact: filters.exact || undefined,
    isOnSale: filters.isOnSale,
    sortOption: filters.sortOption || undefined,
    fromShop: true,
    groupBy: "parents",
  };
}

/** Conteo en vivo para la hoja de filtros: misma consulta, una sola fila. */
export function useFilterCount(filters: ProductFilters, fixedCategoryId?: string, enabled = true) {
  return useQuery({
    queryKey: ["products-count", fixedCategoryId, filtersToQuery(filters, fixedCategoryId)],
    queryFn: async () => {
      const response = await getProducts({ ...filtersToQuery(filters, fixedCategoryId), page: 1, itemsPerPage: 1 });
      return response.isUnavailable ? null : response.totalItems;
    },
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}
