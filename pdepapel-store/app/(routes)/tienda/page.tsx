import { LayoutGrid } from "lucide-react";
import { Metadata } from "next";
import { Suspense } from "react";

import { getCategories } from "@/actions/get-categories";
import { getCatalogOptions } from "@/actions/get-catalog-options";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getTypes } from "@/actions/get-types";
import { CategoryChips } from "@/components/category-chips";
import { Newsletter } from "@/components/newsletter";
import { PageHeader } from "@/components/shop/page-header";
import { ShopContent } from "@/components/shop-content";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, LIMIT_SHOP_ITEMS } from "@/constants";
import { buildNavigationTypes } from "@/lib/catalog-navigation";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { categoryPath, STOREFRONT_ROUTES, typePath } from "@/lib/routes";
import { TypeIcon } from "@/lib/type-icons";

import { PageHeaderSkeleton, ShopContentSkeleton } from "./components/skeletons";

export const revalidate = 300;

const SHOP_INTRO = "Cuadernos, stickers, agendas y regalos bonitos con envío a toda Colombia.";
const HEADER_TYPES = 7;
const HEADER_IMAGES = 3;

export async function generateMetadata({ searchParams }: ShopPageProps): Promise<Metadata> {
  const { typeId, categoryId, search, minPrice, maxPrice } = searchParams;
  const hasActiveFilters = Object.values(searchParams).some((value) => value !== undefined && value !== "");
  let title = "Tienda";
  let description =
    "Explora nuestra tienda online en Papelería P de Papel. Un mundo de artículos bonitos, suministros de oficina y papelería general te espera.";

  if (search) {
    title = `Resultados para "${search}"`;
  } else if (categoryId) {
    const categories = await getCategories();
    const category = categories.find((c) => c.id === categoryId || c.slug === categoryId);
    if (category) title = category.name;
  } else if (typeId) {
    const types = await getTypes();
    const type = types.find((t) => t.id === typeId || t.slug === typeId);
    if (type) title = type.name;
  }

  if (minPrice || maxPrice) {
    const min = minPrice ? `$${parseInt(minPrice, 10).toLocaleString("es-CO")}` : "$0";
    const max = maxPrice ? `$${parseInt(maxPrice, 10).toLocaleString("es-CO")}` : "Sin límite";
    description += ` Filtro de precio activo: ${min} - ${max}.`;
  }

  const images = ["/opengraph-image.png"];
  const keywords = ["papelería", "útiles escolares", "papelería bonita", "oficina", "regalos", "arte"];
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
      googleBot: { index: !hasActiveFilters, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
    },
    alternates: { canonical: canonicalUrl },
    openGraph: { title: `${title} | P de Papel`, description, type: "website", locale: "es_CO", siteName: "Papelería P de Papel", images, url: canonicalUrl },
    twitter: { card: "summary_large_image", title: `${title} | P de Papel`, description, images },
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
    exact?: string;
  };
}

const FILTER_PARAMS = ["typeId", "categoryId", "colorId", "sizeId", "optionValueId", "designId", "isOnSale", "minPrice", "maxPrice", "search"] as const;

async function ShopContentWrapper({ searchParams }: { searchParams: ShopPageProps["searchParams"] }) {
  const hasFilters = FILTER_PARAMS.some((key) => searchParams[key] !== undefined && searchParams[key] !== "");
  const [{ products, totalPages, totalItems, facets, searchCorrection }, types, catalogOptions, colors, designs, categories, catalogTotal] = await Promise.all([
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
      exact: searchParams.exact === "true",
      isOnSale: searchParams.isOnSale === "true",
      groupBy: "parents",
    }),
    getTypes(),
    getCatalogOptions(),
    getColors(),
    getDesigns(),
    getCategories(),
    hasFilters ? getProducts({ fromShop: true, page: 1, itemsPerPage: 1, groupBy: "parents" }).then((response) => response.totalItems) : null,
  ]);

  const navigationTypes = buildNavigationTypes(types, categories);
  const featured = categories.filter((category) => category.seoEnabled && category.seoFeatured && category.slug);
  const headerImages = featured
    .filter((category) => category.imageUrl)
    .slice(0, HEADER_IMAGES)
    .map((category) => ({ url: category.imageUrl as string, alt: stripTaxonomyIcon(category.name) }));
  const suggestions = featured.slice(0, 4).map((category) => ({ label: stripTaxonomyIcon(category.name), href: categoryPath(category.slug as string) }));

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Tienda", href: STOREFRONT_ROUTES.shop, isCurrent: true }];
  if (searchParams.categoryId) {
    const category = categories.find((c) => c.id === searchParams.categoryId || c.slug === searchParams.categoryId);
    if (category) {
      breadcrumbItems[0].isCurrent = false;
      breadcrumbItems.push({ label: stripTaxonomyIcon(category.name), isCurrent: true });
    }
  } else if (searchParams.typeId) {
    const type = types.find((t) => t.id === searchParams.typeId || t.slug === searchParams.typeId);
    if (type) {
      breadcrumbItems[0].isCurrent = false;
      breadcrumbItems.push({ label: stripTaxonomyIcon(type.name), isCurrent: true });
    }
  } else if (searchParams.search) {
    breadcrumbItems[0].isCurrent = false;
    breadcrumbItems.push({ label: `Resultados: ${searchParams.search}`, isCurrent: true });
  }

  return (
    <>
      <CategoryChips types={navigationTypes} className="-mx-4 sm:-mx-6" activeTypeId={types.find((t) => t.id === searchParams.typeId || t.slug === searchParams.typeId)?.id} />
      <Breadcrumb items={breadcrumbItems} />
      <PageHeader
        title="Todos los productos"
        count={catalogTotal ?? totalItems}
        eyebrow={{ icon: <LayoutGrid aria-hidden="true" className="h-[15px] w-[15px]" />, label: "Catálogo completo" }}
        intro={SHOP_INTRO}
        images={headerImages}
        tintKey="tienda"
        chips={navigationTypes.slice(0, HEADER_TYPES).map((type) => ({ label: type.label, href: typePath(type), icon: <TypeIcon type={type} className="h-4 w-4" /> }))}
      />
      <ShopContent
        initialProducts={products}
        initialTotalPages={totalPages}
        initialTotalItems={totalItems}
        initialFacets={facets}
        initialSearchCorrection={searchCorrection}
        types={types}
        categories={categories}
        catalogOptions={catalogOptions}
        colors={colors}
        designs={designs}
        suggestions={suggestions}
      />
    </>
  );
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  return (
    <>
      <Container className="flex flex-col gap-y-4 px-4 pb-12 pt-2 sm:px-6 lg:gap-y-5 lg:px-8 lg:pt-5">
        <Suspense
          fallback={
            <>
              <PageHeaderSkeleton />
              <ShopContentSkeleton />
            </>
          }
        >
          <ShopContentWrapper searchParams={searchParams} />
        </Suspense>
      </Container>
      <Newsletter source="tienda-pie" />
    </>
  );
}
