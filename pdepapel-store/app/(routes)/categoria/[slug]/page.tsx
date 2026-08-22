import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getCategory } from "@/actions/get-category";
import { getCategories } from "@/actions/get-categories";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getSizes } from "@/actions/get-sizes";
import { CategoryLinksSection } from "@/components/category-links-section";
import { CategorySeoContent } from "@/components/category-seo-content";
import { ShopContent } from "@/components/shop-content";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, LIMIT_SHOP_ITEMS } from "@/constants";
import { categoryPath, productPath, STOREFRONT_ROUTES } from "@/lib/routes";

interface CategoryPageProps {
  params: {
    slug: string;
  };
  searchParams: {
    colorId?: string;
    sizeId?: string;
    designId?: string;
    sortOption?: string;
    minPrice?: string;
    maxPrice?: string;
    page?: string;
    search?: string;
    isOnSale?: string;
  };
}

export const revalidate = 300;

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const category = await getCategory(params.slug);

  if (!category) {
    return {
      title: "Categoría no encontrada",
      robots: { index: false, follow: false },
    };
  }

  const categoryUrl = categoryPath(category.slug || category.id);
  const title = category.seoTitle || category.name;
  const description =
    category.seoDescription ||
    `Explora ${category.name} en Papelería P de Papel. Encuentra artículos creativos con envíos a toda Colombia.`;
  const socialImages = category.imageUrl
    ? [{ url: category.imageUrl, alt: category.name }]
    : undefined;
  const hasActiveFilters = Object.values(searchParams).some(
    (value) => value !== undefined && value !== "",
  );
  const shouldIndex = Boolean(category.seoEnabled) && !hasActiveFilters;

  return {
    title,
    description,
    robots: {
      index: shouldIndex,
      follow: true,
      googleBot: {
        index: shouldIndex,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    alternates: {
      canonical: categoryUrl,
    },
    openGraph: {
      title: `${title} | Papelería P de Papel`,
      description,
      url: `${BASE_URL}${categoryUrl}`,
      siteName: "Papelería P de Papel",
      locale: "es_CO",
      type: "website",
      images: socialImages,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Papelería P de Papel`,
      description,
      images: socialImages,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [category, categories] = await Promise.all([
    getCategory(params.slug),
    getCategories(),
  ]);
  if (!category) notFound();

  const canonicalSlug = category.slug || category.id;
  if (params.slug !== canonicalSlug) {
    permanentRedirect(categoryPath(canonicalSlug));
  }

  const [{ products, totalPages, totalItems, facets }, sizes, colors, designs] =
    await Promise.all([
      getProducts({
        categoryId: category.id,
        colorId: searchParams.colorId,
        sizeId: searchParams.sizeId,
        designId: searchParams.designId,
        sortOption: searchParams.sortOption,
        minPrice: searchParams.minPrice
          ? parseInt(searchParams.minPrice, 10)
          : null,
        maxPrice: searchParams.maxPrice
          ? parseInt(searchParams.maxPrice, 10)
          : null,
        fromShop: true,
        page: searchParams.page ? parseInt(searchParams.page, 10) : undefined,
        itemsPerPage: LIMIT_SHOP_ITEMS,
        search: searchParams.search,
        isOnSale: searchParams.isOnSale === "true",
        groupBy: "parents",
      }),
      getSizes(),
      getColors(),
      getDesigns(),
    ]);
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop },
    { label: category.name, isCurrent: true },
  ];
  const categoryUrl = categoryPath(category.slug || category.id);
  const relatedCategories = categories.filter(
    (item) =>
      item.id !== category.id &&
      item.seoEnabled &&
      item.seoFeatured &&
      item.slug,
  );
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: BASE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Tienda",
        item: `${BASE_URL}${STOREFRONT_ROUTES.shop}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: category.name,
        item: `${BASE_URL}${categoryUrl}`,
      },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Productos de ${category.name}`,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {products.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemListJsonLd),
          }}
        />
      )}
      <Container className="space-y-8 py-6">
        <Breadcrumb items={breadcrumbItems} />
        <section className="max-w-3xl space-y-3">
          <h1 className="font-serif text-4xl font-extrabold">
            {category.name}
          </h1>
          <p className="text-muted-foreground">
            {category.seoIntro ||
              `Descubre nuestra selección de ${category.name.toLowerCase()} y encuentra opciones creativas para estudiar, crear o regalar.`}
          </p>
        </section>
        <ShopContent
          initialProducts={products}
          initialTotalPages={totalPages}
          initialTotalItems={totalItems}
          initialFacets={facets}
          types={[]}
          categories={[category]}
          sizes={sizes}
          colors={colors}
          designs={designs}
          fixedCategoryId={category.id}
          heading={`Productos de ${category.name}`}
          searchPlaceholder={`Buscar en ${category.name}`}
        />
        <CategorySeoContent categoryName={category.name} />
      </Container>
      <CategoryLinksSection
        categories={relatedCategories}
        title="Sigue explorando"
        description="Descubre más categorías de papelería creativa que tenemos para ti."
      />
    </>
  );
}
