import { redirect } from "next/navigation";

import { ShopHeaderNav } from "./components/shop-header-nav";
import { LayoutGrid } from "lucide-react";
import { Metadata } from "next";
import { Suspense } from "react";

import { getBrands } from "@/actions/get-brands";
import { getCategories } from "@/actions/get-categories";
import { getCatalogOptions } from "@/actions/get-catalog-options";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getListingProducts, getProducts } from "@/actions/get-products";
import { getTypes } from "@/actions/get-types";
import { Newsletter } from "@/components/newsletter";
import { BrandChipRow } from "@/components/brands/brand-chip-row";
import { PageHeader } from "@/components/shop/page-header";
import { ShopContent } from "@/components/shop-content";
import { Container } from "@/components/ui/container";
import { BASE_URL, DEFAULT_SHARE_IMAGE, LIMIT_SHOP_ITEMS } from "@/constants";
import { buildNavigationTypes, toFilterType, toNavigationCategory, withProducts } from "@/lib/catalog-navigation";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { parseBrandParam } from "@/lib/brand-display";
import type { CatalogQuery } from "@/lib/catalog-params";
import { getShopIndexing, outOfRangePageTarget, type ListingSearchParams } from "@/lib/listing-seo";
import { categoryPath, STOREFRONT_ROUTES, typePath } from "@/lib/routes";
import { TypeIcon } from "@/lib/type-icons";

import { PageHeaderSkeleton, ShopContentSkeleton } from "./components/skeletons";

export const revalidate = 300;
export const maxDuration = 30;

const SHOP_INTRO = "Cuadernos, stickers, agendas y regalos bonitos con envío a toda Colombia.";
const HEADER_TYPES = 7;
const HEADER_IMAGES = 3;

export async function generateMetadata({ searchParams }: ShopPageProps): Promise<Metadata> {
  // Aquí y no dentro del Suspense: los metadatos se resuelven antes de empezar
  // a enviar la página, así que la redirección es un 307 de verdad y no una
  // meta refresh dentro de un 200. 307 y no 308: la última página cambia con
  // el catálogo y un 308 queda guardado en el navegador.
  if (searchParams.page) {
    const { totalPages } = await getProducts(shopListingQuery(searchParams));
    const pageTarget = outOfRangePageTarget(STOREFRONT_ROUTES.shop, searchParams as unknown as ListingSearchParams, totalPages);
    if (pageTarget) redirect(pageTarget);
  }

  const { typeId, categoryId, search, minPrice, maxPrice, marca } = searchParams;
  // Next entrega cada parámetro como texto aunque el tipo diga `number`.
  const { canonical: canonicalPath, index: shouldIndex } = getShopIndexing(
    STOREFRONT_ROUTES.shop,
    searchParams as unknown as ListingSearchParams,
  );
  const brandSlugs = parseBrandParam(marca);
  let title = "Tienda en línea";
  let description =
    "Explora nuestra tienda online en Papelería P de Papel. Un mundo de artículos bonitos, suministros de oficina y papelería general te espera.";

  if (search) {
    title = `Resultados para "${search}"`;
  } else if (categoryId) {
    const categories = await getCategories();
    const category = categories.find((c) => c.id === categoryId || c.slug === categoryId);
    if (category) title = stripTaxonomyIcon(category.name);
  } else if (typeId) {
    const types = await getTypes();
    const type = types.find((t) => t.id === typeId || t.slug === typeId);
    if (type) title = stripTaxonomyIcon(type.name);
  } else if (brandSlugs.length === 1) {
    const brand = (await getBrands()).find((item) => item.slug === brandSlugs[0]);
    if (brand) title = `Productos ${brand.name}`;
  }

  if (minPrice || maxPrice) {
    const min = minPrice ? `$${parseInt(minPrice, 10).toLocaleString("es-CO")}` : "$0";
    const max = maxPrice ? `$${parseInt(maxPrice, 10).toLocaleString("es-CO")}` : "Sin límite";
    description += ` Filtro de precio activo: ${min} - ${max}.`;
  }

  const images = [DEFAULT_SHARE_IMAGE];
  const keywords = ["papelería", "útiles escolares", "papelería bonita", "oficina", "regalos", "arte"];
  if (title !== "Tienda en línea") keywords.unshift(title.toLowerCase());
  if (search) keywords.push(search);

  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  return {
    // La plantilla del layout añade « | Papelería P de Papel».
    title,
    description,
    keywords,
    robots: {
      index: shouldIndex,
      follow: true,
      googleBot: { index: shouldIndex, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
    },
    alternates: { canonical: canonicalUrl },
    openGraph: { title: `${title} | Papelería P de Papel`, description, type: "website", locale: "es_CO", siteName: "Papelería P de Papel", images, url: canonicalUrl },
    twitter: { card: "summary_large_image", title: `${title} | Papelería P de Papel`, description, images },
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
    /** Slugs de marca separados por coma. */
    marca?: string;
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

function shopListingQuery(searchParams: ShopPageProps["searchParams"]): CatalogQuery {
  return {
    typeId: searchParams.typeId,
    categoryId: searchParams.categoryId,
    colorId: searchParams.colorId,
    sizeId: searchParams.sizeId,
    optionValueId: searchParams.optionValueId,
    designId: searchParams.designId,
    marca: searchParams.marca,
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
  };
}

const FILTER_PARAMS = ["typeId", "categoryId", "colorId", "sizeId", "optionValueId", "designId", "marca", "isOnSale", "minPrice", "maxPrice", "search"] as const;

async function ShopContentWrapper({ searchParams }: { searchParams: ShopPageProps["searchParams"] }) {
  const hasFilters = FILTER_PARAMS.some((key) => searchParams[key] !== undefined && searchParams[key] !== "");
  const [{ products, totalPages, totalItems, facets, searchCorrection }, types, catalogOptions, colors, designs, categories, catalogTotal, brands] = await Promise.all([
    getListingProducts(searchParams, shopListingQuery(searchParams)),
    getTypes(),
    getCatalogOptions(),
    getColors(),
    getDesigns(),
    getCategories(),
    hasFilters ? getProducts({ fromShop: true, page: 1, itemsPerPage: 1, groupBy: "parents" }).then((response) => response.totalItems) : null,
    getBrands(),
  ]);

  const pageTarget = outOfRangePageTarget(STOREFRONT_ROUTES.shop, searchParams as unknown as ListingSearchParams, totalPages);
  if (pageTarget) redirect(pageTarget);

  const navigationTypes = buildNavigationTypes(types, categories);
  const featured = categories.filter((category) => category.seoEnabled && category.seoFeatured && category.slug);
  const headerImages = featured
    .filter((category) => category.imageUrl)
    .slice(0, HEADER_IMAGES)
    .map((category) => ({ url: category.imageUrl as string, alt: stripTaxonomyIcon(category.name) }));
  const suggestions = featured.slice(0, 4).map((category) => ({ label: stripTaxonomyIcon(category.name), href: categoryPath(category.slug as string) }));

  return (
    <>
      <ShopHeaderNav
        navigationTypes={navigationTypes}
        types={types.map(toFilterType)}
        categories={categories.map(toNavigationCategory)}
      />
      <PageHeader
        title="Todos los productos"
        count={catalogTotal ?? totalItems}
        eyebrow={{ icon: <LayoutGrid aria-hidden="true" className="h-[15px] w-[15px]" />, label: "Catálogo completo" }}
        intro={SHOP_INTRO}
        images={headerImages}
        tintKey="tienda"
        chips={navigationTypes.slice(0, HEADER_TYPES).map((type) => ({ label: type.label, href: typePath(type), icon: <TypeIcon type={type} className="h-4 w-4" /> }))}
        brandsSlot={brands.length > 0 ? <BrandChipRow brands={brands} searchParams={searchParams as unknown as ListingSearchParams} /> : null}
      />
      <ShopContent
        initialProducts={products}
        initialTotalPages={totalPages}
        initialTotalItems={totalItems}
        initialFacets={facets}
        initialSearchCorrection={searchCorrection}
        types={types.map(toFilterType)}
        categories={withProducts(categories).map(toNavigationCategory)}
        catalogOptions={catalogOptions}
        colors={colors}
        designs={designs}
        suggestions={suggestions}
        brands={brands.map((brand) => ({ id: brand.slug, name: brand.name }))}
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
              <PageHeaderSkeleton withBrands />
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
