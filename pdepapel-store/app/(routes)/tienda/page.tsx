import { Metadata } from "next";
import { Suspense } from "react";

import { getCategories } from "@/actions/get-categories";
import { getCatalogOptions } from "@/actions/get-catalog-options";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getTypes } from "@/actions/get-types";
import Features from "@/components/features";
import Newsletter from "@/components/newsletter";
import { ShopContent } from "@/components/shop-content";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, LIMIT_SHOP_ITEMS } from "@/constants";
import { STOREFRONT_ROUTES } from "@/lib/routes";

import { ShopContentSkeleton } from "./components/skeletons";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: ShopPageProps): Promise<Metadata> {
  const { typeId, categoryId, search, minPrice, maxPrice } = searchParams;
  const hasActiveFilters = Object.values(searchParams).some(
    (value) => value !== undefined && value !== "",
  );
  let title = "Tienda";
  let description =
    "Explora nuestra tienda online en Papelería P de Papel. Un mundo de artículos kawaii, suministros de oficina y papelería general te espera.";

  if (search) {
    title = `Resultados para "${search}"`;
  } else if (categoryId) {
    const categories = await getCategories();
    const category = categories.find(
      (c) => c.id === categoryId || c.slug === categoryId,
    );
    if (category) {
      title = category.name;
    }
  } else if (typeId) {
    const types = await getTypes();
    const type = types.find((t) => t.id === typeId || t.slug === typeId);
    if (type) {
      title = type.name;
    }
  }

  if (minPrice || maxPrice) {
    const min = minPrice
      ? `$${parseInt(minPrice, 10).toLocaleString("es-CO")}`
      : "$0";
    const max = maxPrice
      ? `$${parseInt(maxPrice, 10).toLocaleString("es-CO")}`
      : "Sin límite";
    description += ` Filtro de precio activo: ${min} - ${max}.`;
  }

  const images = ["/opengraph-image.png"];

  const keywords = [
    "papelería",
    "útiles escolares",
    "kawaii",
    "oficina",
    "regalos",
    "arte",
  ];
  if (title !== "Tienda") keywords.unshift(title.toLowerCase());
  if (search) keywords.push(search);

  const canonicalUrl = `${BASE_URL}${STOREFRONT_ROUTES.shop}`;

  return {
    title: `${title} | P de Papel`,
    description,
    keywords,
    robots: {
      index: !hasActiveFilters,
      follow: true,
      googleBot: {
        index: !hasActiveFilters,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${title} | P de Papel`,
      description,
      type: "website",
      locale: "es_CO",
      siteName: "Papelería P de Papel",
      images,
      url: canonicalUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | P de Papel`,
      description,
      images,
    },
  };
}
interface ShopPageProps {
  searchParams: {
    typeId: string;
    colorId: string;
    sizeId: string;
    optionValueId: string;
    categoryId: string;
    designId: string;
    sortOption: string;
    isOnSale: string;
    minPrice: string;
    maxPrice: string;
    page: number;
    itemsPerPage: number;
    search: string;
  };
}

async function ShopContentWrapper({
  searchParams,
}: {
  searchParams: ShopPageProps["searchParams"];
}) {
  const [
    { products, totalPages, totalItems, facets },
    types,
    catalogOptions,
    colors,
    designs,
    categories,
  ] = await Promise.all([
    getProducts({
      typeId: searchParams.typeId,
      categoryId: searchParams.categoryId,
      colorId: searchParams.colorId,
      sizeId: searchParams.sizeId,
      optionValueId: searchParams.optionValueId,
      designId: searchParams.designId,
      sortOption: searchParams.sortOption,
      minPrice: searchParams.minPrice ? parseInt(searchParams.minPrice) : null,
      maxPrice: searchParams.maxPrice ? parseInt(searchParams.maxPrice) : null,
      fromShop: true,
      page: searchParams.page,
      itemsPerPage: LIMIT_SHOP_ITEMS,
      search: searchParams.search,
      isOnSale: searchParams.isOnSale === "true",
      groupBy: "parents",
    }),
    getTypes(),
    getCatalogOptions(),
    getColors(),
    getDesigns(),
    getCategories(),
  ]);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop, isCurrent: true },
  ];

  if (searchParams.categoryId) {
    const category = categories.find(
      (c) =>
        c.id === searchParams.categoryId || c.slug === searchParams.categoryId,
    );
    if (category) {
      breadcrumbItems[0].isCurrent = false;
      breadcrumbItems.push({
        label: category.name,
        isCurrent: true,
      });
    }
  } else if (searchParams.typeId) {
    const type = types.find(
      (t) => t.id === searchParams.typeId || t.slug === searchParams.typeId,
    );
    if (type) {
      breadcrumbItems[0].isCurrent = false;
      breadcrumbItems.push({
        label: type.name,
        isCurrent: true,
      });
    }
  } else if (searchParams.search) {
    breadcrumbItems[0].isCurrent = false;
    breadcrumbItems.push({
      label: `Resultados: ${searchParams.search}`,
      isCurrent: true,
    });
  }

  return (
    <>
      <h1 className="sr-only">Tienda en línea de Papelería P de Papel</h1>
      <Breadcrumb items={breadcrumbItems} className="mt-6" />
      <ShopContent
        initialProducts={products}
        initialTotalPages={totalPages}
        initialTotalItems={totalItems}
        initialFacets={facets}
        types={types}
        categories={categories}
        catalogOptions={catalogOptions}
        colors={colors}
        designs={designs}
      />
    </>
  );
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  return (
    <>
      <Features />
      <Container className="flex flex-col gap-y-8">
        <Suspense fallback={<ShopContentSkeleton />}>
          <ShopContentWrapper searchParams={searchParams} />
        </Suspense>
      </Container>
      <Newsletter />
    </>
  );
}
