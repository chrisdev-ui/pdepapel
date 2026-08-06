"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { track } from "@vercel/analytics/react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getProducts } from "@/actions/get-products";
import Filter from "@/components/filter";
import PriceFilter from "@/components/price-filter";
import { Button } from "@/components/ui/button";
import { LIMIT_SHOP_ITEMS, SORT_OPTIONS } from "@/constants";
import { useProductFilters } from "@/hooks/use-product-filters";
import { Category, Color, Design, Product, Size, Type } from "@/types";

import Products from "../app/(routes)/tienda/components/products";
import ShopSearchBar from "../app/(routes)/tienda/components/shop-search-bar";
import {
  MobileFiltersSkeleton,
  ProductListSkeleton,
} from "../app/(routes)/tienda/components/skeletons";
import SortSelector from "../app/(routes)/tienda/components/sort-selector";

const MobileFilters = dynamic(() => import("@/components/mobile-filters"), {
  ssr: false,
  loading: () => <MobileFiltersSkeleton />,
});

interface ShopContentProps {
  initialProducts: Product[];
  initialTotalPages: number;
  initialTotalItems: number;
  initialFacets?: {
    colors: { id: string; count: number }[];
    formattedSizes: { id: string; count: number }[];
    categories: { id: string; count: number }[];
    designs: { id: string; count: number }[];
  };
  types: Type[];
  categories: Category[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  fixedCategoryId?: string;
  heading?: string;
  searchPlaceholder?: string;
}

export const ShopContent: React.FC<ShopContentProps> = ({
  initialProducts,
  initialTotalPages,
  initialTotalItems,
  initialFacets,
  types,
  categories,
  sizes,
  colors,
  designs,
  fixedCategoryId,
  heading = "Todos los productos",
  searchPlaceholder,
}) => {
  const { filters, setFilters } = useProductFilters();
  const [isMounted, setIsMounted] = useState(false);
  const noResultsQueryRef = useRef<string>();

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      typeId: fixedCategoryId ? [] : filters.typeId,
      categoryId: fixedCategoryId ? [fixedCategoryId] : filters.categoryId,
    }),
    [filters, fixedCategoryId],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { data, isLoading, isPlaceholderData, isFetching } = useQuery({
    queryKey: ["products", fixedCategoryId, effectiveFilters],
    queryFn: () =>
      getProducts({
        ...effectiveFilters,
        page: effectiveFilters.page,
        colorId: Array.isArray(effectiveFilters.colorId)
          ? effectiveFilters.colorId.join(",")
          : effectiveFilters.colorId,
        sizeId: Array.isArray(effectiveFilters.sizeId)
          ? effectiveFilters.sizeId.join(",")
          : effectiveFilters.sizeId,
        typeId: Array.isArray(effectiveFilters.typeId)
          ? effectiveFilters.typeId.join(",")
          : effectiveFilters.typeId,
        categoryId: Array.isArray(effectiveFilters.categoryId)
          ? effectiveFilters.categoryId.join(",")
          : effectiveFilters.categoryId,
        designId: Array.isArray(effectiveFilters.designId)
          ? effectiveFilters.designId.join(",")
          : effectiveFilters.designId,
        minPrice: effectiveFilters.minPrice,
        maxPrice: effectiveFilters.maxPrice,
        fromShop: true,
        itemsPerPage: LIMIT_SHOP_ITEMS,
        groupBy: "parents",
      }),
    initialData: isMounted
      ? undefined
      : {
          products: initialProducts,
          totalPages: initialTotalPages,
          totalItems: initialTotalItems,
          facets: initialFacets,
        },
    initialDataUpdatedAt: isMounted ? undefined : Date.now(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: isMounted,
    placeholderData: keepPreviousData,
  });

  // Helper to merge counts into static data
  const mergeCounts = (
    data: any[],
    facetCounts: { id: string; count: number }[] | undefined,
  ) => {
    if (!facetCounts) return data;
    const countMap = new Map(facetCounts.map((f) => [f.id, f.count]));
    return data.map((item) => ({
      ...item,
      count: countMap.get(item.id) ?? 0, // Default to 0 if not found in facets
    }));
  };

  // Filter categories based on selected Type(s)
  // We filtering based on type first, THEN merge counts.
  // Actually, facets from backend might already respect the type filter if it restricts the product set.
  // The 'filteredCategories' logic ensures we only show categories belonging to the selected TYPE.
  const typeFilteredCategories = categories.filter((category) => {
    if (effectiveFilters.typeId.length === 0) return true;
    return effectiveFilters.typeId.includes(category.typeId);
  });

  const categoriesWithCounts = mergeCounts(
    typeFilteredCategories,
    data?.facets?.categories,
  );
  const onlyAvailableInCategory = (items: any[]) =>
    fixedCategoryId ? items.filter((item) => item.count > 0) : items;
  const colorsWithCounts = onlyAvailableInCategory(
    mergeCounts(colors, data?.facets?.colors),
  );
  const sizesWithCounts = onlyAvailableInCategory(
    mergeCounts(sizes, data?.facets?.formattedSizes),
  );
  const designsWithCounts = onlyAvailableInCategory(
    mergeCounts(designs, data?.facets?.designs),
  );
  const hasActiveCategoryFilters = Boolean(
    filters.typeId.length ||
    filters.categoryId.length ||
    filters.colorId.length ||
    filters.sizeId.length ||
    filters.designId.length ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.search ||
    filters.sortOption ||
    filters.isOnSale,
  );
  const totalItems = data?.totalItems ?? initialTotalItems;

  useEffect(() => {
    if (!isMounted || isFetching || !data || data.products.length > 0) return;

    const queryKey = JSON.stringify(effectiveFilters);
    if (noResultsQueryRef.current === queryKey) return;

    noResultsQueryRef.current = queryKey;
    track("catalog_no_results", {
      has_search: Boolean(effectiveFilters.search),
      active_filters:
        effectiveFilters.colorId.length +
        effectiveFilters.sizeId.length +
        effectiveFilters.designId.length +
        Number(effectiveFilters.isOnSale),
    });
  }, [data, effectiveFilters, isFetching, isMounted]);

  const clearCategoryFilters = () => {
    setFilters({
      typeId: null,
      categoryId: null,
      colorId: null,
      sizeId: null,
      designId: null,
      minPrice: null,
      maxPrice: null,
      sortOption: null,
      search: null,
      isOnSale: null,
      page: 1,
    });
  };

  return (
    <div className="lg:grid lg:grid-cols-5 lg:gap-x-8">
      <div className="hidden lg:block">
        {!fixedCategoryId && (
          <Filter
            valueKey="typeId"
            name="Categorías"
            data={types}
            emptyMessage="No hay tipos disponibles"
          />
        )}
        {!fixedCategoryId && (
          <Filter
            valueKey="categoryId"
            name="Sub-Categorías"
            emptyMessage="No hay categorías disponibles"
            data={categoriesWithCounts}
          />
        )}
        {sizesWithCounts.length > 0 && (
          <Filter
            valueKey="sizeId"
            name="Tamaños"
            emptyMessage="No hay tamaños disponibles"
            data={sizesWithCounts}
          />
        )}
        {colorsWithCounts.length > 0 && (
          <Filter
            valueKey="colorId"
            name="Colores"
            emptyMessage="No hay colores disponibles"
            data={colorsWithCounts}
          />
        )}
        {designsWithCounts.length > 0 && (
          <Filter
            valueKey="designId"
            name="Diseños"
            emptyMessage="No hay diseños disponibles"
            data={designsWithCounts}
          />
        )}
        <PriceFilter min={0} max={1000000} step={1000} />
      </div>
      <div className="mt-6 space-y-8 lg:col-span-4 lg:mt-0">
        <div className="flex w-full flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-sans text-3xl font-bold">{heading}</h2>
            {fixedCategoryId && (
              <p
                className="mt-1 text-sm text-muted-foreground"
                aria-live="polite"
              >
                {totalItems} {totalItems === 1 ? "producto" : "productos"}
              </p>
            )}
          </div>
          <section className="flex w-full items-center gap-2 md:w-auto md:gap-4">
            {fixedCategoryId && hasActiveCategoryFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearCategoryFilters}
              >
                Limpiar filtros
                <X className="ml-1 h-4 w-4" />
              </Button>
            )}
            <ShopSearchBar
              className="hidden md:flex"
              placeholder={searchPlaceholder}
            />
            <SortSelector options={SORT_OPTIONS} />
          </section>
        </div>
        <MobileFilters
          types={types}
          categories={categories}
          sizes={sizesWithCounts}
          colors={colorsWithCounts}
          designs={designsWithCounts}
          hideCategoryFilters={Boolean(fixedCategoryId)}
        />
        <ShopSearchBar className="md:hidden" placeholder={searchPlaceholder} />
        {/* We need to handle the pagination inside Products or lift it here. Products component takes totalPages. */}
        <div className="relative min-h-[400px]">
          {isLoading ? (
            <ProductListSkeleton />
          ) : (
            <div
              className={`transition-opacity duration-300 ease-in-out ${
                isFetching ? "pointer-events-none opacity-50" : "opacity-100"
              }`}
            >
              <Products
                products={data?.products ?? []}
                totalPages={data?.totalPages ?? 0}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
