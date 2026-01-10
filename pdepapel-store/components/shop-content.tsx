"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { getProducts } from "@/actions/get-products";
import Filter from "@/components/filter";
import PriceFilter from "@/components/price-filter";
import { LIMIT_SHOP_ITEMS, SORT_OPTIONS } from "@/constants";
import { useProductFilters } from "@/hooks/use-product-filters";
import { Category, Color, Design, Product, Size, Type } from "@/types";

import Products from "../app/(routes)/shop/components/products";
import ShopSearchBar from "../app/(routes)/shop/components/shop-search-bar";
import { ProductListSkeleton } from "../app/(routes)/shop/components/skeletons";
import SortSelector from "../app/(routes)/shop/components/sort-selector";

const MobileFilters = dynamic(() => import("@/components/mobile-filters"), {
  ssr: false,
});

interface ShopContentProps {
  initialProducts: Product[];
  initialTotalPages: number;
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
}

export const ShopContent: React.FC<ShopContentProps> = ({
  initialProducts,
  initialTotalPages,
  initialFacets,
  types,
  categories,
  sizes,
  colors,
  designs,
}) => {
  const { filters, setFilter } = useProductFilters();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { data, isLoading, isPlaceholderData, isFetching } = useQuery({
    queryKey: ["products", filters],
    queryFn: () =>
      getProducts({
        ...filters,
        page: filters.page,
        colorId: Array.isArray(filters.colorId)
          ? filters.colorId.join(",")
          : filters.colorId,
        sizeId: Array.isArray(filters.sizeId)
          ? filters.sizeId.join(",")
          : filters.sizeId,
        typeId: Array.isArray(filters.typeId)
          ? filters.typeId.join(",")
          : filters.typeId,
        categoryId: Array.isArray(filters.categoryId)
          ? filters.categoryId.join(",")
          : filters.categoryId,
        designId: Array.isArray(filters.designId)
          ? filters.designId.join(",")
          : filters.designId,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        fromShop: true,
        itemsPerPage: LIMIT_SHOP_ITEMS,
        groupBy: "parents",
      }),
    initialData: isMounted
      ? undefined
      : {
          products: initialProducts,
          totalPages: initialTotalPages,
          totalItems: 0,
          facets: initialFacets,
        },
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
    if (filters.typeId.length === 0) return true;
    return filters.typeId.includes(category.typeId);
  });

  const categoriesWithCounts = mergeCounts(
    typeFilteredCategories,
    data?.facets?.categories,
  );
  const colorsWithCounts = mergeCounts(colors, data?.facets?.colors);
  const sizesWithCounts = mergeCounts(sizes, data?.facets?.formattedSizes); // Note: backend returns 'formattedSizes'
  const designsWithCounts = mergeCounts(designs, data?.facets?.designs);

  return (
    <div className="lg:grid lg:grid-cols-5 lg:gap-x-8">
      <div className="hidden lg:block">
        <Filter
          valueKey="typeId"
          name="Tipos"
          data={types} // Types might not have facets in the spec provided, leaving as is or assuming no counts requested for Types yet.
          emptyMessage="No hay tipos disponibles"
        />
        <Filter
          valueKey="categoryId"
          name="Categorías"
          emptyMessage="No hay categorías disponibles"
          data={categoriesWithCounts}
        />
        <Filter
          valueKey="sizeId"
          name="Tamaños"
          emptyMessage="No hay tamaños disponibles"
          data={sizesWithCounts}
        />
        <Filter
          valueKey="colorId"
          name="Colores"
          emptyMessage="No hay colores disponibles"
          data={colorsWithCounts}
        />
        <Filter
          valueKey="designId"
          name="Diseños"
          emptyMessage="No hay diseños disponibles"
          data={designsWithCounts}
        />
        <PriceFilter min={0} max={1000000} step={1000} />
      </div>
      <div className="mt-6 space-y-8 lg:col-span-4 lg:mt-0">
        <div className="flex w-full items-center justify-between">
          <h2 className="font-serif text-3xl font-bold">Todos los productos</h2>
          <section className="flex w-full items-center gap-4 md:w-auto">
            <ShopSearchBar className="hidden md:flex" />
            <SortSelector options={SORT_OPTIONS} />
          </section>
        </div>
        <MobileFilters
          types={types}
          categories={categories}
          sizes={sizes}
          colors={colors}
          designs={designs}
        />
        <ShopSearchBar className="md:hidden" />
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
