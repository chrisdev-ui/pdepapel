import { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { Suspense } from "react";
import { v4 as uuidv4 } from "uuid";

import { getCategories } from "@/actions/get-categories";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getSizes } from "@/actions/get-sizes";
import { getTypes } from "@/actions/get-types";
import Await from "@/components/await";
import { Container } from "@/components/ui/container";
import { PRICES, SORT_OPTIONS } from "@/constants";
import Products from "./components/products";
import { ProductsContainerSkeleton } from "./components/skeletons";

const ShopSearchBar = nextDynamic(
  () => import("./components/shop-search-bar"),
  {
    ssr: false,
  },
);

const SortSelector = nextDynamic(() => import("./components/sort-selector"), {
  ssr: false,
});

const MobileFilters = nextDynamic(() => import("@/components/mobile-filters"), {
  ssr: false,
});

const Filter = nextDynamic(() => import("@/components/filter"), {
  ssr: false,
});

const Features = nextDynamic(() => import("@/components/features"), {
  ssr: false,
});

const Newsletter = nextDynamic(() => import("@/components/newsletter"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Tienda",
  description:
    "Explora nuestra tienda online en Papelería P de Papel. Un mundo de artículos kawaii, suministros de oficina y papelería general te espera. Descubre productos únicos y de calidad para darle un toque especial a tu espacio de trabajo o estudio. Navega, elige y compra con facilidad.",
  alternates: {
    canonical: "/shop",
  },
};

interface ShopPageProps {
  searchParams: {
    typeId: string;
    colorId: string;
    sizeId: string;
    categoryId: string;
    designId: string;
    sortOption: string;
    priceRange: string;
    page: number;
    itemsPerPage: number;
    search: string;
  };
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const getProductsAsync = getProducts({
    typeId: searchParams.typeId,
    categoryId: searchParams.categoryId,
    colorId: searchParams.colorId,
    sizeId: searchParams.sizeId,
    designId: searchParams.designId,
    sortOption: searchParams.sortOption,
    priceRange: searchParams.priceRange,
    fromShop: true,
    page: searchParams.page,
    itemsPerPage: searchParams.itemsPerPage,
    search: searchParams.search,
  });

  const [types, sizes, colors, designs] = await Promise.all([
    getTypes(),
    getSizes(),
    getColors(),
    getDesigns(),
  ]);
  let categories = await getCategories();

  if (searchParams.typeId && types.length > 0) {
    categories =
      types.find((type) => type.id === searchParams.typeId)?.categories ?? [];
  }

  return (
    <>
      <Features />
      <Container className="flex flex-col gap-y-8">
        <div className="lg:grid lg:grid-cols-5 lg:gap-x-8">
          <div className="hidden lg:block">
            <Filter
              valueKey="typeId"
              name="Tipos"
              data={types}
              emptyMessage="No hay tipos disponibles"
            />
            <Filter
              valueKey="categoryId"
              name="Categorías"
              emptyMessage="No hay categorías disponibles"
              data={categories}
            />
            <Filter
              valueKey="sizeId"
              name="Tamaños"
              emptyMessage="No hay tamaños disponibles"
              data={sizes}
            />
            <Filter
              valueKey="colorId"
              name="Colores"
              emptyMessage="No hay colores disponibles"
              data={colors}
            />
            <Filter
              valueKey="designId"
              name="Diseños"
              emptyMessage="No hay diseños disponibles"
              data={designs}
            />
            <Filter
              valueKey="priceRange"
              name="Precios"
              emptyMessage="No hay precios disponibles"
              data={PRICES}
            />
          </div>
          <div className="mt-6 space-y-8 lg:col-span-4 lg:mt-0">
            <div className="flex w-full items-center justify-between">
              <h2 className="font-serif text-3xl font-bold">
                Todos los productos
              </h2>
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
              pricesRanges={PRICES}
              designs={designs}
            />
            <ShopSearchBar className="md:hidden" />
            <Suspense key={uuidv4()} fallback={<ProductsContainerSkeleton />}>
              <Await promise={getProductsAsync}>
                {({ products, totalPages }) => (
                  <Products products={products} totalPages={totalPages} />
                )}
              </Await>
            </Suspense>
          </div>
        </div>
      </Container>
      <Newsletter />
    </>
  );
}
