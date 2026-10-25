import { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import { getBrand } from "@/actions/get-brands";
import { getListingProducts, getProducts } from "@/actions/get-products";
import { BrandEmptyState } from "@/components/brands/brand-empty-state";
import { BrandHeader } from "@/components/brands/brand-header";
import { BrandLines } from "@/components/brands/brand-lines";
import { ShopContent } from "@/components/shop-content";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, DEFAULT_SHARE_IMAGE, LIMIT_SHOP_ITEMS } from "@/constants";
import { getBrandPageState } from "@/lib/brand-display";
import type { CatalogQuery } from "@/lib/catalog-params";
import { outOfRangePageTarget, type ListingSearchParams } from "@/lib/listing-seo";
import { brandPath, STOREFRONT_ROUTES } from "@/lib/routes";
import type { BrandPageData } from "@/types";

export interface BrandPageProps {
  params: { slug: string };
  searchParams: {
    categoryId?: string;
    sortOption?: string;
    page?: string;
  };
}

export const revalidate = 300;
export const maxDuration = 30;

const hasValue = (value: unknown) => value !== undefined && value !== "";

/** La marca o, si el slug es viejo, la 308 a la dirección actual; oculta, archivada o inexistente: 404. */
async function resolveBrand(slug: string): Promise<BrandPageData> {
  const found = await getBrand(slug);
  if (found.kind === "redirect") permanentRedirect(brandPath(found.slug));
  if (found.kind === "missing") notFound();
  if (found.brand.slug !== slug) permanentRedirect(brandPath(found.brand.slug));
  return found.brand;
}

function brandListingQuery(slug: string, searchParams: BrandPageProps["searchParams"]): CatalogQuery {
  return {
    marca: slug,
    categoryId: searchParams.categoryId || undefined,
    sortOption: searchParams.sortOption || undefined,
    page: searchParams.page ? parseInt(searchParams.page, 10) : undefined,
    fromShop: true,
    itemsPerPage: LIMIT_SHOP_ITEMS,
    groupBy: "parents",
  };
}

export async function generateMetadata({ params, searchParams }: BrandPageProps): Promise<Metadata> {
  const brand = await resolveBrand(params.slug);
  const hasParams = Object.values(searchParams).some(hasValue);
  const listed = (await getListingProducts(searchParams, brandListingQuery(brand.slug, {}))).totalItems;
  const state = getBrandPageState(brand.productCount, listed);
  const index = state.kind === "products" && state.index && !hasParams;
  const canonical = `${BASE_URL}${brandPath(brand.slug)}`;
  const title = `${brand.name}: productos originales`;
  const description = brand.seoText || `Productos originales ${brand.name} en Papelería P de Papel, con envío a toda Colombia.`;

  return {
    // La plantilla del layout añade « | Papelería P de Papel».
    title,
    description,
    robots: { index, follow: true, googleBot: { index, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    alternates: { canonical },
    openGraph: { title: `${title} | Papelería P de Papel`, description, url: canonical, siteName: "Papelería P de Papel", locale: "es_CO", type: "website", images: [DEFAULT_SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title: `${title} | Papelería P de Papel`, description },
  };
}

export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const brand = await resolveBrand(params.slug);
  const hasFilters = hasValue(searchParams.categoryId);

  const [{ products, totalPages, totalItems, facets, searchCorrection }, brandTotal] = await Promise.all([
    getListingProducts(searchParams, brandListingQuery(brand.slug, searchParams)),
    hasFilters ? getProducts(brandListingQuery(brand.slug, {})).then((response) => response.totalItems) : null,
  ]);

  const pageTarget = outOfRangePageTarget(brandPath(brand.slug), searchParams as ListingSearchParams, totalPages);
  if (pageTarget) redirect(pageTarget);

  const state = getBrandPageState(brand.productCount, brandTotal ?? totalItems);
  const url = `${BASE_URL}${brandPath(brand.slug)}`;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Marcas", item: `${BASE_URL}${STOREFRONT_ROUTES.brands}` },
      { "@type": "ListItem", position: 3, name: brand.name, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <Container className="flex flex-col gap-y-4 px-4 pb-12 pt-2 sm:px-6 lg:gap-y-5 lg:px-8 lg:pt-5">
        <Breadcrumb
          items={[
            { label: "Marcas", href: STOREFRONT_ROUTES.brands },
            { label: brand.name, isCurrent: true },
          ]}
        />
        <BrandHeader brand={brand} count={state.kind === "empty" ? null : (brandTotal ?? totalItems)} activeCategoryId={searchParams.categoryId} />
        {state.kind === "empty" ? (
          <BrandEmptyState />
        ) : (
          <>
            <BrandLines brandName={brand.name} lines={brand.lines ?? []} />
            <ShopContent
              initialProducts={products}
              initialTotalPages={totalPages}
              initialTotalItems={totalItems}
              initialFacets={facets}
              initialSearchCorrection={searchCorrection}
              types={[]}
              categories={[]}
              catalogOptions={[]}
              colors={[]}
              designs={[]}
              fixedBrandSlug={brand.slug}
              showFilters={false}
              heading={`Productos ${brand.name}`}
            />
          </>
        )}
      </Container>
    </>
  );
}
