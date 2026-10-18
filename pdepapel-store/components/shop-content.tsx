"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MobileFilters from "@/components/mobile-filters";
import { SaveSearchButton } from "@/components/shop/save-search-button";
import { MobileToolbar, ShopToolbar } from "@/components/shop/shop-toolbar";
import { ShopSidebar } from "@/components/shop/shop-sidebar";
import { NoResultsPanel, SuggestionChip } from "@/components/ui/no-results";
import { LIMIT_SHOP_ITEMS } from "@/constants";
import { fetchCatalogFromClient } from "@/lib/catalog-client";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { filtersToQuery } from "@/hooks/use-filter-count";
import { ProductFilters, useProductFilters } from "@/hooks/use-product-filters";
import { toAnalyticsItem, trackCustomerEvent } from "@/lib/customer-analytics";
import { brandLogoUrl, brandToggleHref, joinBrandNames } from "@/lib/brand-display";
import { buildActiveFilterChips, countActiveFilters, EMPTY_FILTERS, formatProductCount, formatResultRange, removeFilterChip } from "@/lib/shop-filters";
import type { FilterType, NavigationCategory } from "@/lib/catalog-navigation";
import { CatalogOption, Color, Design, Product, ProductsResponse } from "@/types";

import Products from "../app/(routes)/tienda/components/products";
import ShopSearchBar from "../app/(routes)/tienda/components/shop-search-bar";
import { ProductListSkeleton } from "../app/(routes)/tienda/components/skeletons";
import { sanitizeSearchTerm } from "@/lib/analytics-search-term";

/** How long the grid may show its loading tint before giving up on it. */
const CATALOG_BUSY_HINT_MS = 8_000;

interface ShopContentProps {
  initialProducts: Product[];
  initialTotalPages: number;
  initialTotalItems: number;
  initialFacets?: ProductsResponse["facets"];
  initialSearchCorrection?: ProductsResponse["searchCorrection"];
  types: FilterType[];
  categories: NavigationCategory[];
  catalogOptions: CatalogOption[];
  colors: Color[];
  designs: Design[];
  fixedCategoryId?: string;
  heading?: string;
  searchPlaceholder?: string;
  /** Categorías sugeridas cuando no hay resultados. */
  suggestions?: SuggestionChip[];
  /** Marcas visibles (`id` = slug) para nombrar los filtros aunque la faceta no las traiga. */
  brands?: { id: string; name: string }[];
  /** Página de una marca: la marca va fija y las tarjetas no la repiten. */
  fixedBrandSlug?: string;
  /** Sin barra lateral ni botón de filtros (página de marca). */
  showFilters?: boolean;
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
  initialSearchCorrection,
  types,
  categories,
  catalogOptions,
  colors,
  designs,
  fixedCategoryId,
  heading = "Todos los productos",
  searchPlaceholder,
  suggestions = [],
  brands = [],
  fixedBrandSlug,
  showFilters = true,
}) => {
  const { filters, setFilters } = useProductFilters();
  const [isMounted, setIsMounted] = useState(false);
  const noResultsQueryRef = useRef<string>();
  const viewedListRef = useRef<string>();

  const effectiveFilters = useMemo<ProductFilters>(
    () => ({
      ...filters,
      typeId: fixedCategoryId ? [] : filters.typeId,
      categoryId: fixedCategoryId ? [fixedCategoryId] : filters.categoryId,
      marca: fixedBrandSlug ? [fixedBrandSlug] : (filters.marca ?? []),
    }),
    [filters, fixedCategoryId, fixedBrandSlug],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { data, isLoading, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ["products", fixedCategoryId, effectiveFilters],
    queryFn: ({ signal }) => fetchCatalogFromClient({ ...filtersToQuery(effectiveFilters, fixedCategoryId, fixedBrandSlug), page: effectiveFilters.page, itemsPerPage: LIMIT_SHOP_ITEMS }, signal),
    initialData: isMounted ? undefined : { products: initialProducts, totalPages: initialTotalPages, totalItems: initialTotalItems, facets: initialFacets, searchCorrection: initialSearchCorrection },
    initialDataUpdatedAt: isMounted ? undefined : Date.now(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: isMounted,
    placeholderData: keepPreviousData,
  });

  // `isFetching` can stick on true: a catalog query whose server action was
  // dropped mid-navigation never settles. It may tint the grid, never disable
  // it, and it stops claiming «busy» after a few seconds so the page does not
  // sit there pretending to load.
  const [busyHintExpired, setBusyHintExpired] = useState(false);
  useEffect(() => {
    if (!isFetching) {
      setBusyHintExpired(false);
      return;
    }
    const timer = window.setTimeout(
      () => setBusyHintExpired(true),
      CATALOG_BUSY_HINT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isFetching]);
  const showBusyHint = isFetching && !isLoading && !busyHintExpired;

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

  const selectedBrands = effectiveFilters.marca;
  // Una marca elegida se queda en la lista aunque con los demás filtros cuente 0: si no, no se podría quitar.
  const brandFilterItems = fixedBrandSlug
    ? []
    : [
        ...(facets?.brands ?? []).map((facet) => ({ id: facet.id, name: facet.name, count: facet.count, logoUrl: brandLogoUrl(facet) })),
        ...selectedBrands
          .filter((slug) => !(facets?.brands ?? []).some((facet) => facet.id === slug))
          .map((slug) => ({ id: slug, name: brands.find((brand) => brand.id === slug)?.name ?? slug, count: 0, logoUrl: null })),
      ];
  const brandLookup = [...brands, ...(facets?.brands ?? []).map((facet) => ({ id: facet.id, name: facet.name }))];
  const selectedBrandNames = selectedBrands.map((slug) => brandLookup.find((brand) => brand.id === slug)?.name ?? slug);

  // La marca no va como chip: la nombra la línea de resultados («N productos de Kiut · Quitar»).
  const ignoredKeys = useMemo<(keyof ProductFilters)[]>(
    () => [...(fixedCategoryId ? (["categoryId", "typeId"] as const) : []), "marca"],
    [fixedCategoryId],
  );
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
          brands,
        },
        ignoredKeys,
      ),
    [filters, types, categories, colors, designs, catalogOptions, brands, ignoredKeys],
  );
  const activeCount = countActiveFilters(filters, fixedCategoryId ? ["categoryId", "typeId"] : []);
  const totalItems = data?.totalItems ?? initialTotalItems;
  const isCatalogUnavailable = Boolean(data?.isUnavailable);
  const products = data?.products ?? [];

  /**
   * Trae otra página con los filtros vigentes, para que «Cargar más» pueda
   * seguir en vez de morirse al acabar la página actual.
   *
   * Vive aquí y no dentro de la cuadrícula porque los filtros están aquí: si
   * la cuadrícula los armara por su cuenta, «Cargar más» podría traer una
   * página de otra búsqueda. Devuelve `null` cuando el catálogo no responde,
   * que es cómo `fetchCatalogFromClient` avisa de un fallo —no lanza—.
   */
  const loadPage = useCallback(
    async (page: number) => {
      const response = await fetchCatalogFromClient({
        ...filtersToQuery(effectiveFilters, fixedCategoryId, fixedBrandSlug),
        page,
        itemsPerPage: LIMIT_SHOP_ITEMS,
      });
      return response.isUnavailable ? null : response.products;
    },
    [effectiveFilters, fixedCategoryId, fixedBrandSlug],
  );
  const rangeText = formatResultRange(filters.page, LIMIT_SHOP_ITEMS, totalItems);
  const clearBrands = () => setFilters({ marca: [], page: 1 });
  const brandLine =
    !fixedBrandSlug && selectedBrands.length > 0 ? (
      <>
        {/* Mientras llega la lista nueva, el total es el de la anterior: no se pega al nombre de la marca. */}
        {isPlaceholderData ? "Buscando productos" : formatProductCount(totalItems)} de {joinBrandNames(selectedBrandNames)} ·{" "}
        <button type="button" onClick={clearBrands} className="font-semibold text-blue-yankees underline underline-offset-4">
          Quitar
        </button>
      </>
    ) : null;
  const correction = data?.searchCorrection ?? null;

  const canSaveSearch = showFilters && (activeCount > 0 || Boolean(filters.search));
  const suggestedSearchName =
    [...selectedBrandNames, ...chips.map((chip) => (chip.key === "search" ? `«${filters.search}»` : chip.label))].join(" · ") || heading;
  const saveSearchSlot = canSaveSearch ? <SaveSearchButton suggestedName={suggestedSearchName} fixedCategoryId={fixedCategoryId} /> : null;

  const clearFilters = () => setFilters({ ...EMPTY_FILTERS, sortOption: filters.sortOption, page: 1 });

  /*
   * La fila de marcas de /tienda son enlaces pintados en el servidor (sin JS
   * propio). Aquí solo se mantienen al día con la URL: marca y enlace de cada
   * chip, y un clic normal cambia el filtro en el sitio como las casillas, sin
   * recargar ni pasar por loading.tsx. Clic con modificador: el enlace normal.
   */
  const brandKey = selectedBrands.join(",");
  useEffect(() => {
    if (!isMounted || fixedBrandSlug) return;
    const params = Object.fromEntries(new URLSearchParams(window.location.search));
    document.querySelectorAll<HTMLAnchorElement>("a[data-brand-chip]").forEach((chip) => {
      const slug = chip.dataset.brandChip as string;
      if (selectedBrands.includes(slug)) chip.setAttribute("aria-current", "true");
      else chip.removeAttribute("aria-current");
      chip.setAttribute("href", brandToggleHref(window.location.pathname, params, slug));
    });
    // `filters` entra para rehacer los enlaces con los demás filtros vigentes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, fixedBrandSlug, brandKey, filters]);

  useEffect(() => {
    if (fixedBrandSlug) return;
    const onClick = (event: MouseEvent) => {
      const chip = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-brand-chip]");
      if (!chip || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const slug = chip.dataset.brandChip as string;
      setFilters((previous) => {
        const current = previous.marca ?? [];
        return { ...previous, marca: current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug], page: 1 };
      });
    };
    // En captura: los chips son `<a>` del servidor; sin esto navegarían con carga completa.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [fixedBrandSlug, setFilters]);
  const removeChip = (chip: (typeof chips)[number]) => setFilters(removeFilterChip(filters, chip));

  useEffect(() => {
    if (!isMounted || isFetching || !data || data.products.length > 0) return;
    const queryKey = JSON.stringify(effectiveFilters);
    if (noResultsQueryRef.current === queryKey) return;
    noResultsQueryRef.current = queryKey;
    trackCustomerEvent("catalog_no_results", {
      has_search: Boolean(effectiveFilters.search),
      // Lo que se buscó sin encontrar nada: la señal de demanda que faltaba.
      search_term: sanitizeSearchTerm(effectiveFilters.search),
      active_filters: countActiveFilters(effectiveFilters, ["search", "isOnSale"]) + Number(effectiveFilters.isOnSale),
    });
  }, [data, effectiveFilters, isFetching, isMounted]);

  useEffect(() => {
    if (!isMounted || isFetching || !data || data.products.length === 0) return;
    const listKey = `${heading}:${effectiveFilters.page}:${data.products.map((product) => product.id).join(",")}`;
    if (viewedListRef.current === listKey) return;
    viewedListRef.current = listKey;
    trackCustomerEvent("view_item_list", {
      item_list_id: fixedCategoryId || (fixedBrandSlug ? `marca:${fixedBrandSlug}` : "shop"),
      item_list_name: heading,
      items: data.products.map((product) => toAnalyticsItem(product, 1)),
    });
  }, [data, effectiveFilters.page, fixedBrandSlug, fixedCategoryId, heading, isFetching, isMounted]);

  const filterGroups = {
    types: typesWithCounts,
    categories: categoriesWithCounts,
    catalogOptions: visibleCatalogOptions,
    colors: colorsWithCounts,
    designs: designsWithCounts,
    brands: brandFilterItems,
    hideCategoryFilters: Boolean(fixedCategoryId),
  };

  return (
    <div className={showFilters ? "lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-10" : undefined}>
      {showFilters && <ShopSidebar {...filterGroups} activeCount={activeCount} onClearAll={clearFilters} />}
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
        <MobileToolbar
          filtersSlot={showFilters ? <MobileFilters {...filterGroups} fixedCategoryId={fixedCategoryId} /> : null}
          chips={chips}
          onRemoveChip={removeChip}
          onClearAll={clearFilters}
          rangeText={rangeText}
          brandLine={brandLine}
        />
        {fixedCategoryId && <ShopSearchBar className="lg:hidden" placeholder={searchPlaceholder} />}
        <ShopToolbar
          chips={chips}
          onRemoveChip={removeChip}
          onClearAll={clearFilters}
          rangeText={rangeText}
          brandLine={brandLine}
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
          aria-busy={showBusyHint}
          aria-label="Resultados del catálogo"
          aria-live="polite"
          className={`min-h-[400px] outline-none transition-opacity duration-300 ease-in-out ${showBusyHint ? "opacity-70" : "opacity-100"}`}
        >
          {isLoading ? (
            <ProductListSkeleton />
          ) : isCatalogUnavailable ? (
            <NoResultsPanel variant="error" onRetry={() => refetch()} />
          ) : products.length === 0 ? (
            <NoResultsPanel
              variant={filters.search ? "search" : activeCount > 0 ? "filters" : "empty"}
              query={filters.search}
              suggestions={suggestions}
              onClearFilters={activeCount > 0 ? clearFilters : undefined}
            />
          ) : (
            <Products
              products={products}
              totalPages={data?.totalPages ?? 0}
              currentPage={effectiveFilters.page ?? 1}
              loadPage={loadPage}
              hideBrand={Boolean(fixedBrandSlug) || selectedBrands.length === 1}
            />
          )}
        </section>
      </div>
    </div>
  );
};
