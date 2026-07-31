import { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCategories } from "@/actions/get-categories";
import { getColors } from "@/actions/get-colors";
import { getDesigns } from "@/actions/get-designs";
import { getProducts } from "@/actions/get-products";
import { getSizes } from "@/actions/get-sizes";
import { getTypes } from "@/actions/get-types";
import { ShopContent } from "@/components/shop-content";
import { Breadcrumb, BreadcrumbItem } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { BASE_URL, LIMIT_SHOP_ITEMS } from "@/constants";
import { categoryPath, STOREFRONT_ROUTES } from "@/lib/routes";

interface CategoryPageProps {
  params: {
    slug: string;
  };
}

export const revalidate = 60;

const getCategoryBySlug = async (slug: string) => {
  const categories = await getCategories();
  return categories.find((category) => category.slug === slug);
};

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const category = await getCategoryBySlug(params.slug);

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

  return {
    title,
    description,
    robots: {
      index: Boolean(category.seoEnabled),
      follow: true,
      googleBot: {
        index: Boolean(category.seoEnabled),
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
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Papelería P de Papel`,
      description,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const category = await getCategoryBySlug(params.slug);
  if (!category) notFound();

  const [{ products, totalPages, facets }, types, sizes, colors, designs] =
    await Promise.all([
      getProducts({
        categoryId: category.id,
        fromShop: true,
        itemsPerPage: LIMIT_SHOP_ITEMS,
        groupBy: "parents",
      }),
      getTypes(),
      getSizes(),
      getColors(),
      getDesigns(),
    ]);
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop },
    { label: category.name, isCurrent: true },
  ];
  const categoryUrl = categoryPath(category.slug || category.id);
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
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
          initialFacets={facets}
          types={types}
          categories={[category]}
          sizes={sizes}
          colors={colors}
          designs={designs}
          fixedCategoryId={category.id}
          heading={`Productos de ${category.name}`}
        />
      </Container>
    </>
  );
}
