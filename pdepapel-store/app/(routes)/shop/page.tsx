import { Metadata } from "next";

import { getCategories } from "@/actions/get-categories";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getSizes } from "@/actions/get-sizes";
import { getTypes } from "@/actions/get-types";
import Features from "@/components/features";
import Newsletter from "@/components/newsletter";
import { ShopContent } from "@/components/shop-content";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, LIMIT_SHOP_ITEMS } from "@/constants";

export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: ShopPageProps): Promise<Metadata> {
  const { typeId, categoryId, search, minPrice, maxPrice } = searchParams;
  let title = "Tienda";
  let description =
    "Explora nuestra tienda online en Papelería P de Papel. Un mundo de artículos kawaii, suministros de oficina y papelería general te espera.";

  if (search) {
    title = `Resultados para "${search}"`;
  } else if (categoryId) {
    const categories = await getCategories();
    const category = categories.find((c) => c.id === categoryId);
    if (category) {
      title = category.name;
    }
  } else if (typeId) {
    const types = await getTypes();
    const type = types.find((t) => t.id === typeId);
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

  // Fetch one product to get a relevant image
  const { products } = await getProducts({
    typeId,
    categoryId,
    colorId: searchParams.colorId,
    sizeId: searchParams.sizeId,
    designId: searchParams.designId,
    minPrice: minPrice ? parseInt(minPrice, 10) : null,
    maxPrice: maxPrice ? parseInt(maxPrice, 10) : null,
    search,
    limit: 1,
  });

  const previousImages = [`/opengraph-image.png`];
  const images =
    products.length > 0 && products[0].images.length > 0
      ? [products[0].images[0].url, ...previousImages]
      : previousImages;

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

  // Construct canonical URL with essential filters
  const canonicalUrl = new URL(`${BASE_URL}/shop`);
  if (categoryId) canonicalUrl.searchParams.set("categoryId", categoryId);
  if (typeId) canonicalUrl.searchParams.set("typeId", typeId);
  if (search) canonicalUrl.searchParams.set("search", search);

  return {
    title: `${title} | P de Papel`,
    description,
    keywords,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical: canonicalUrl.toString(),
    },
    openGraph: {
      title: `${title} | P de Papel`,
      description,
      type: "website",
      locale: "es_CO",
      siteName: "Papelería P de Papel",
      images,
      url: canonicalUrl.toString(),
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
    categoryId: string;
    designId: string;
    sortOption: string;
    minPrice: string;
    maxPrice: string;
    page: number;
    itemsPerPage: number;
    search: string;
  };
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const { products, totalPages, facets } = await getProducts({
    typeId: searchParams.typeId,
    categoryId: searchParams.categoryId,
    colorId: searchParams.colorId,
    sizeId: searchParams.sizeId,
    designId: searchParams.designId,
    sortOption: searchParams.sortOption,
    minPrice: searchParams.minPrice ? parseInt(searchParams.minPrice) : null,
    maxPrice: searchParams.maxPrice ? parseInt(searchParams.maxPrice) : null,
    fromShop: true,
    page: searchParams.page,
    itemsPerPage: LIMIT_SHOP_ITEMS,
    search: searchParams.search,
    groupBy: "parents",
  });

  const [types, sizes, colors, designs, categories] = await Promise.all([
    getTypes(),
    getSizes(),
    getColors(),
    getDesigns(),
    getCategories(),
  ]);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: "/shop", isCurrent: true },
  ];

  if (searchParams.categoryId) {
    const category = categories.find((c) => c.id === searchParams.categoryId);
    if (category) {
      breadcrumbItems[0].isCurrent = false;
      breadcrumbItems.push({
        label: category.name,
        isCurrent: true,
      });
    }
  } else if (searchParams.typeId) {
    const type = types.find((t) => t.id === searchParams.typeId);
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
      <Features />
      <Container className="flex flex-col gap-y-8">
        <Breadcrumb items={breadcrumbItems} className="mt-6" />
        <ShopContent
          initialProducts={products}
          initialTotalPages={totalPages}
          initialFacets={facets}
          types={types}
          categories={categories}
          sizes={sizes}
          colors={colors}
          designs={designs}
        />
      </Container>
      <Newsletter />
    </>
  );
}
