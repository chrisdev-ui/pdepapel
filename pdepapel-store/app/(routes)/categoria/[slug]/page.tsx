import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getCategory } from "@/actions/get-category";
import { getCatalogOptions } from "@/actions/get-catalog-options";
import { getCategories } from "@/actions/get-categories";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getTypes } from "@/actions/get-types";
import { CategoryChips } from "@/components/category-chips";
import { CategoryRail } from "@/components/home/category-rail";
import { PageHeader } from "@/components/shop/page-header";
import { ShopContent } from "@/components/shop-content";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, LIMIT_SHOP_ITEMS } from "@/constants";
import { buildNavigationTypes } from "@/lib/catalog-navigation";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { categoryPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { TypeIcon } from "@/lib/type-icons";

interface CategoryPageProps {
  params: { slug: string };
  searchParams: {
    colorId?: string;
    sizeId?: string;
    optionValueId?: string;
    designId?: string;
    sortOption?: string;
    minPrice?: string;
    maxPrice?: string;
    page?: string;
    search?: string;
    exact?: string;
    isOnSale?: string;
  };
}

export const revalidate = 300;

const SIBLING_CHIPS = 5;

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const category = await getCategory(params.slug);
  if (!category) return { title: "Categoría no encontrada", robots: { index: false, follow: false } };

  const categoryUrl = categoryPath(category.slug || category.id);
  const name = stripTaxonomyIcon(category.name);
  const title = category.seoTitle || name;
  const description = category.seoDescription || `Explora ${name} en Papelería P de Papel. Encuentra artículos creativos con envíos a toda Colombia.`;
  const socialImages = category.imageUrl ? [{ url: category.imageUrl, alt: name }] : undefined;
  const hasActiveFilters = Object.values(searchParams).some((value) => value !== undefined && value !== "");
  const shouldIndex = Boolean(category.seoEnabled) && !hasActiveFilters;

  return {
    title,
    description,
    robots: { index: shouldIndex, follow: true, googleBot: { index: shouldIndex, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    alternates: { canonical: categoryUrl },
    openGraph: { title: `${title} | Papelería P de Papel`, description, url: `${BASE_URL}${categoryUrl}`, siteName: "Papelería P de Papel", locale: "es_CO", type: "website", images: socialImages },
    twitter: { card: "summary_large_image", title: `${title} | Papelería P de Papel`, description, images: socialImages },
  };
}

/** Sin foto de categoría, la burbuja usa la foto del producto más representativo. */
async function resolveCover(categoryId: string, imageUrl: string | null | undefined, alt: string) {
  if (imageUrl) return { url: imageUrl, alt };
  const { products } = await getProducts({ categoryId, fromShop: true, page: 1, itemsPerPage: 1, sortOption: "featuredFirst", groupBy: "parents" });
  const url = products[0]?.images?.find((image) => image.isMain)?.url ?? products[0]?.images?.[0]?.url;
  return url ? { url, alt } : null;
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [category, categories, types] = await Promise.all([getCategory(params.slug), getCategories(), getTypes()]);
  if (!category) notFound();

  const canonicalSlug = category.slug || category.id;
  if (params.slug !== canonicalSlug) permanentRedirect(categoryPath(canonicalSlug));

  const name = stripTaxonomyIcon(category.name);
  const hasFilters = Object.entries(searchParams).some(([key, value]) => key !== "sortOption" && key !== "page" && value !== undefined && value !== "");

  const [{ products, totalPages, totalItems, facets, searchCorrection }, catalogOptions, colors, designs, cover, categoryTotal] = await Promise.all([
    getProducts({
      categoryId: category.id,
      colorId: searchParams.colorId,
      sizeId: searchParams.sizeId,
      optionValueId: searchParams.optionValueId,
      designId: searchParams.designId,
      sortOption: searchParams.sortOption,
      minPrice: searchParams.minPrice ? parseInt(searchParams.minPrice, 10) : null,
      maxPrice: searchParams.maxPrice ? parseInt(searchParams.maxPrice, 10) : null,
      fromShop: true,
      page: searchParams.page ? parseInt(searchParams.page, 10) : undefined,
      itemsPerPage: LIMIT_SHOP_ITEMS,
      search: searchParams.search,
      exact: searchParams.exact === "true",
      isOnSale: searchParams.isOnSale === "true",
      groupBy: "parents",
    }),
    getCatalogOptions(),
    getColors(),
    getDesigns(),
    resolveCover(category.id, category.imageUrl, name),
    hasFilters ? getProducts({ categoryId: category.id, fromShop: true, page: 1, itemsPerPage: 1, groupBy: "parents" }).then((response) => response.totalItems) : null,
  ]);

  const type = types.find((item) => item.id === category.typeId);
  const typeLabel = type ? stripTaxonomyIcon(type.name) : null;
  const siblings = categories
    .filter((item) => item.id !== category.id && item.typeId === category.typeId && item.slug)
    .slice(0, SIBLING_CHIPS)
    .map((item) => ({ label: stripTaxonomyIcon(item.name), href: categoryPath(item.slug as string) }));
  const relatedCategories = categories.filter((item) => item.id !== category.id && item.seoEnabled && item.seoFeatured && item.slug);
  const suggestions = relatedCategories.slice(0, 4).map((item) => ({ label: stripTaxonomyIcon(item.name), href: categoryPath(item.slug as string) }));
  const intro = category.seoIntro || `Descubre nuestra selección de ${name.toLocaleLowerCase("es-CO")} y encuentra opciones creativas para estudiar, crear o regalar.`;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop },
    { label: name, isCurrent: true },
  ];
  const categoryUrl = categoryPath(canonicalSlug);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Tienda", item: `${BASE_URL}${STOREFRONT_ROUTES.shop}` },
      { "@type": "ListItem", position: 3, name, item: `${BASE_URL}${categoryUrl}` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Productos de ${name}`,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.name,
      item: `${BASE_URL}${productPath(product.slug || product.id)}`,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {products.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />}
      <Container className="flex flex-col gap-y-4 px-4 pb-12 pt-2 sm:px-6 lg:gap-y-5 lg:px-8 lg:pt-5">
        <CategoryChips types={buildNavigationTypes(types, categories)} activeTypeId={category.typeId} className="-mx-4 sm:-mx-6" />
        <Breadcrumb items={breadcrumbItems} />
        <PageHeader
          title={name}
          count={categoryTotal ?? totalItems}
          eyebrow={type ? { icon: <TypeIcon type={type} className="h-[15px] w-[15px]" />, label: typeLabel as string } : undefined}
          intro={intro}
          images={cover ? [cover] : []}
          tintKey={category.id}
          chipsLabel={typeLabel ? `También en ${typeLabel}:` : undefined}
          chips={siblings}
        />
        <ShopContent
          initialProducts={products}
          initialTotalPages={totalPages}
          initialTotalItems={totalItems}
          initialFacets={facets}
        initialSearchCorrection={searchCorrection}
          types={[]}
          categories={[category]}
          catalogOptions={catalogOptions}
          colors={colors}
          designs={designs}
          fixedCategoryId={category.id}
          heading={`Productos de ${name}`}
          searchPlaceholder={`Buscar en ${name}`}
          suggestions={suggestions}
        />
      </Container>
      <CategoryRail categories={relatedCategories} title="Sigue explorando" moreHref={null} />
    </>
  );
}
