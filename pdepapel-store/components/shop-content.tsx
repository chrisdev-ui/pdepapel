"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getProducts } from "@/actions/get-products";
import { SaveSearchButton } from "@/components/shop/save-search-button";
import { MobileToolbar, ShopToolbar } from "@/components/shop/shop-toolbar";
import { ShopSidebar } from "@/components/shop/shop-sidebar";
import { NoResultsPanel, SuggestionChip } from "@/components/ui/no-results";
import { LIMIT_SHOP_ITEMS } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { filtersToQuery } from "@/hooks/use-filter-count";
import { ProductFilters, useProductFilters } from "@/hooks/use-product-filters";
import { toAnalyticsItem, trackCustomerEvent } from "@/lib/customer-analytics";
import { buildActiveFilterChips, countActiveFilters, EMPTY_FILTERS, formatResultRange, removeFilterChip } from "@/lib/shop-filters";
import { CatalogOption, Category, Color, Design, Product, ProductsResponse, Type } from "@/types";

import Products from "../app/(routes)/tienda/components/products";
import ShopSearchBar from "../app/(routes)/tienda/components/shop-search-bar";
import { ProductListSkeleton } from "../app/(routes)/tienda/components/skeletons";

const MobileFilters = dynamic(() => import("@/components/mobile-filters"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-11 flex-1 rounded-full border-[1.5px] border-blue-yankees/30" />,
});

interface ShopContentProps {
  initialProducts: Product[];
  initialTotalPages: number;
  initialTotalItems: number;
  initialFacets?: ProductsResponse["facets"];
  types: Type[];
  categories: Category[];
  catalogOptions: CatalogOption[];
  colors: Color[];
  designs: Design[];
  fixedCategoryId?: string;
  heading?: string;
  searchPlaceholder?: string;
  /** Categorías sugeridas cuando no hay resultados. */
  suggestions?: SuggestionChip[];
}

function mergeCounts<T extends { id: string }>(data: T[], facetCounts: { id: string; count: number }[] | undefined): (T & { count?: number })[] {
  if (!facetCounts) return data;
  const countMap = new Map(facetCounts.map((facet) => [facet.id, facet.count]));
  return data.map((item) => ({ ...item, count: countMap.get(item.id) ?? 0 }));
}

export const ShopContent: React.FC<ShopContentProps> = ({
  initialProducts,
  initialTotalPages,
  initialTotalItems,
  initialFacets,
  types,
  categories,
  catalogOptions,
  colors,
  designs,
  fixedCategoryId,
  heading = "Todos los productos",
  searchPlaceholder,
  suggestions = [],
}) => {
  const { filters, setFilters } = useProductFilters();
  const [isMounted, setIsMounted] = useState(false);
  const noResultsQueryRef = useRef<string>();
  const viewedListRef = useRef<string>();

  const effectiveFilters = useMemo<ProductFilters>(
    () => ({ ...filters, typeId: fixedCategoryId ? [] : filters.typeId, categoryId: fixedCategoryId ? [fixedCategoryId] : filters.categoryId }),
    [filters, fixedCategoryId],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["products", fixedCategoryId, effectiveFilters],
    queryFn: () => getProducts({ ...filtersToQuery(effectiveFilters, fixedCategoryId), page: effectiveFilters.page, itemsPerPage: LIMIT_SHOP_ITEMS }),
    initialData: isMounted ? undefined : { products: initialProducts, totalPages: initialTotalPages, totalItems: initialTotalItems, facets: initialFacets },
    initialDataUpdatedAt: isMounted ? undefined : Date.now(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: isMounted,
    placeholderData: keepPreviousData,
  });

  const facets = data?.facets;
  const typeFilteredCategories = categories.filter((category) => effectiveFilters.typeId.length === 0 || effectiveFilters.typeId.includes(category.typeId));
  const typesWithCounts = mergeCounts(types, facets?.types);
  const categoriesWithCounts = mergeCounts(typeFilteredCategories, facets?.categories);
  const onlyAvailableInCategory = <T extends { count?: number }>(items: T[]) => (fixedCategoryId ? items.filter((item) => item.count === undefined || item.count > 0) : items);
  const colorsWithCounts = onlyAvailableInCategory(mergeCounts(colors, facets?.colors));
  const designsWithCounts = onlyAvailableInCategory(mergeCounts(designs, facets?.designs));
  const selectedCategoryIds = fixedCategoryId ? [fixedCategoryId] : effectiveFilters.categoryId;
  const optionValueCounts = facets?.optionValues ? new Map(facets.optionValues.map((facet) => [facet.id, facet.count])) : null;
  const visibleCatalogOptions = catalogOptions
    .filter((option) => selectedCategoryIds.length === 0 || option.categoryIds.some((categoryId) => selectedCategoryIds.includes(categoryId)))
    .map((option) => ({
      ...option,
      values: option.values
        .map((value) => ({
          ...value,
          count: optionValueCounts
            ? (optionValueCounts.get(value.id) ?? 0)
            : selectedCategoryIds.length === 0
              ? value.count
              : selectedCategoryIds.reduce((total, categoryId) => total + (value.categoryCounts?.[categoryId] ?? 0), 0),
        }))
        .filter((value) => value.count > 0 || filters.optionValueId.includes(value.id)),
    }))
    .filter((option) => option.values.length > 0);

  const ignoredKeys = useMemo<(keyof ProductFilters)[]>(() => (fixedCategoryId ? ["categoryId", "typeId"] : []), [fixedCategoryId]);
  const chips = useMemo(
    () =>
      buildActiveFilterChips(
        filters,
        {
          types,
          categories,
          colors,
          designs,
          optionValues: catalogOptions.flatMap((option) => option.values.map((value) => ({ id: value.id, name: `${option.name}: ${value.name}` }))),
        },
        ignoredKeys,
      ),
    [filters, types, categories, colors, designs, catalogOptions, ignoredKeys],
  );
  const activeCount = countActiveFilters(filters, ignoredKeys);
  const totalItems = data?.totalItems ?? initialTotalItems;
  const isCatalogUnavailable = Boolean(data?.isUnavailable);
  const products = data?.products ?? [];
  const rangeText = formatResultRange(filters.page, LIMIT_SHOP_ITEMS, totalItems);
  const correction = data?.searchCorrection ?? null;

  const canSaveSearch = activeCount > 0 || Boolean(filters.search);
  const suggestedSearchName = [filters.search ? `«${filters.search}»` : null, ...chips.map((chip) => chip.label)].filter(Boolean).join(" · ") || heading;
  const saveSearchSlot = canSaveSearch ? <SaveSearchButton suggestedName={suggestedSearchName} fixedCategoryId={fixedCategoryId} /> : null;

  const clearFilters = () => setFilters({ ...EMPTY_FILTERS, sortOption: filters.sortOption, page: 1 });
  const removeChip = (chip: (typeof chips)[number]) => setFilters(removeFilterChip(filters, chip));

  useEffect(() => {
    if (!isMounted || isFetching || !data || data.products.length > 0) return;
    const queryKey = JSON.stringify(effectiveFilters);
    if (noResultsQueryRef.current === queryKey) return;
    noResultsQueryRef.current = queryKey;
    trackCustomerEvent("catalog_no_results", {
      has_search: Boolean(effectiveFilters.search),
      active_filters: countActiveFilters(effectiveFilters, ["search", "isOnSale"]) + Number(effectiveFilters.isOnSale),
    });
  }, [data, effectiveFilters, isFetching, isMounted]);

  useEffect(() => {
    if (!isMounted || isFetching || !data || data.products.length === 0) return;
    const listKey = `${heading}:${effectiveFilters.page}:${data.products.map((product) => product.id).join(",")}`;
    if (viewedListRef.current === listKey) return;
    viewedListRef.current = listKey;
    trackCustomerEvent("view_item_list", {
      item_list_id: fixedCategoryId || "shop",
      item_list_name: heading,
      items: data.products.map((product) => toAnalyticsItem(product, 1)),
    });
  }, [data, effectiveFilters.page, fixedCategoryId, heading, isFetching, isMounted]);

  const filterGroups = {
    types: typesWithCounts,
    categories: categoriesWithCounts,
    catalogOptions: visibleCatalogOptions,
    colors: colorsWithCounts,
    designs: designsWithCounts,
    hideCategoryFilters: Boolean(fixedCategoryId),
  };

  return (
    <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-10">
      <ShopSidebar {...filterGroups} activeCount={activeCount} onClearAll={clearFilters} />
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
        <MobileToolbar
          filtersSlot={<MobileFilters {...filterGroups} fixedCategoryId={fixedCategoryId} />}
          chips={chips}
          onRemoveChip={removeChip}
          onClearAll={clearFilters}
          rangeText={rangeText}
        />
        {fixedCategoryId && <ShopSearchBar className="lg:hidden" placeholder={searchPlaceholder} />}
        <ShopToolbar
          chips={chips}
          onRemoveChip={removeChip}
          onClearAll={clearFilters}
          rangeText={rangeText}
          searchSlot={fixedCategoryId ? <ShopSearchBar className="w-60 xl:w-72" placeholder={searchPlaceholder} /> : null}
          actionSlot={saveSearchSlot}
        />
        {saveSearchSlot && <div className="flex justify-end lg:hidden">{saveSearchSlot}</div>}
        {correction && (
          <p role="status" className="rounded-xl bg-kawaii-yellow-light/60 px-4 py-2.5 font-sans text-sm text-blue-yankees">
            Mostrando resultados para <strong>«{correction.corrected}»</strong>.{" "}
            <Link
              href={`${STOREFRONT_ROUTES.shop}?search=${encodeURIComponent(correction.original)}&exact=true`}
              className="font-semibold underline underline-offset-4"
            >
              Buscar «{correction.original}» tal cual
            </Link>
          </p>
        )}
        <section
          id="catalog-results"
          tabIndex={-1}
          aria-busy={isFetching}
          aria-label="Resultados del catálogo"
          aria-live="polite"
          className={`min-h-[400px] outline-none transition-opacity duration-300 ease-in-out ${isFetching && !isLoading ? "pointer-events-none opacity-50" : "opacity-100"}`}
        >
          {isLoading ? (
            <ProductListSkeleton />
          ) : isCatalogUnavailable ? (
            <NoResultsPanel variant="error" onRetry={() => refetch()} />
          ) : products.length === 0 ? (
            <NoResultsPanel
              variant={filters.search ? "search" : "filters"}
              query={filters.search}
              suggestions={suggestions}
              onClearFilters={activeCount > 0 ? clearFilters : undefined}
            />
          ) : (
            <Products products={products} totalPages={data?.totalPages ?? 0} />
          )}
        </section>
      </div>
    </div>
  );
};
