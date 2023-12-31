import { Metadata } from "next";

import { getCategories } from "@/actions/get-categories";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getSizes } from "@/actions/get-sizes";
import { getTypes } from "@/actions/get-types";
import { Features } from "@/components/features";
import { Filter } from "@/components/filter";
import { MobileFilters } from "@/components/mobile-filters";
import { Newsletter } from "@/components/newsletter";
import { Container } from "@/components/ui/container";
import { NoResults } from "@/components/ui/no-results";
import { ProductCard } from "@/components/ui/product-card";
import { KAWAII_FACE_SAD, SortOptions } from "@/constants";
import { PriceRange } from "@/types";
import { Paginator } from "./components/paginator";
import { SortSelector } from "./components/sort-selector";

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
  };
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const [{ products, totalPages }, types, sizes, colors, designs] =
    await Promise.all([
      getProducts({
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
      }),
      getTypes(),
      getSizes(),
      getColors(),
      getDesigns(),
    ]);
  let categories = await getCategories();

  const sortOptions = [
    { value: SortOptions.dateAdded, label: "Los más nuevos" },
    { value: SortOptions.priceLowToHigh, label: "Menor precio" },
    { value: SortOptions.priceHighToLow, label: "Mayor precio" },
    { value: SortOptions.name, label: "Nombre de producto" },
    { value: SortOptions.featuredFirst, label: "Destacados" },
  ];

  const prices: PriceRange[] = [
    { id: "[0,5000]", name: "Menos de $5,000" },
    { id: "[5000,10000]", name: "Entre $5,000 y $10,000" },
    { id: "[10000,20000]", name: "Entre $10,000 y $20,000" },
    { id: "[20000,50000]", name: "Entre $20,000 y $50,000" },
    { id: "[50000,99999999]", name: "Más de $50,000" },
  ];

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
              data={products.length > 0 ? prices : []}
            />
          </div>
          <div className="mt-6 space-y-8 lg:col-span-4 lg:mt-0">
            <div className="flex w-full items-center justify-between">
              <h2 className="font-serif text-3xl font-bold">
                Todos los productos
              </h2>
              <SortSelector
                options={sortOptions}
                isDisabled={products.length === 0}
              />
            </div>
            <MobileFilters
              types={types}
              categories={categories}
              sizes={sizes}
              colors={colors}
              pricesRanges={prices}
              designs={designs}
            />
            {products.length === 0 && (
              <NoResults message={`No hay productos ${KAWAII_FACE_SAD}`} />
            )}
            {!!products.length && (
              <div className="grid grid-cols-2 gap-1 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
            <div className="flex w-full items-center">
              <Paginator totalPages={totalPages} />
            </div>
          </div>
        </div>
      </Container>
      <Newsletter />
    </>
  );
}
