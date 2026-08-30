import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getProduct } from "@/actions/get-product";
import { getProducts } from "@/actions/get-products";
import Newsletter from "@/components/newsletter";
import { RelatedProducts } from "@/components/related-products";
import { RelatedProductsSkeleton } from "@/components/related-products-skeleton";
import { SingleProductPage } from "@/components/single-product-page";
import { Container } from "@/components/ui/container";
import { BASE_URL } from "@/constants";
import { createRichTextExcerpt } from "@/lib/rich-text";
import { getStructuredProductSize } from "@/lib/product-options";
import { categoryPath, productPath } from "@/lib/routes";
import { Product } from "@/types";
import { Suspense } from "react";

interface ProductPageProps {
  params: {
    slug: string;
  };
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const product = await getProduct(params.slug);

  if (!product) {
    notFound();
  }

  const canonicalSlug = product.slug || product.id;
  const canonicalPath = productPath(canonicalSlug);
  const images = product.images?.map((image) => image.url);
  const variantAttributes = [
    product.design?.name,
    product.color?.name,
    product.size?.name,
  ]
    .filter(Boolean)
    .join(", ");
  const title = variantAttributes
    ? `${product.name} - ${variantAttributes}`
    : product.name;
  const description = createRichTextExcerpt(
    product.description,
    `Descubre ${product.name} en Papelería P de Papel. Este artículo kawaii/oficina es perfecto para añadir un toque especial a tu espacio. Detalles, especificaciones, y todo lo que necesitas saber para tomar la mejor decisión. Calidad y diseño se unen para ofrecerte lo mejor en papelería.`,
  );

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: product.isArchived
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    openGraph: {
      title,
      description,
      url: `${BASE_URL}${canonicalPath}`,
      siteName: "Papelería P de Papel",
      images,
    },
    twitter: {
      title,
      description,
      card: "summary_large_image",
      site: "Papelería P de Papel",
      images,
    },
  };
}

export const revalidate = 300;

function buildProductSchema(product: Product, includeGroupReference = true) {
  const slug = product.slug || product.id;
  const path = productPath(slug);
  const brand = product.brand || product.productGroup?.brand;

  return {
    "@type": "Product",
    name: product.name,
    description: createRichTextExcerpt(
      product.description,
      `Descubre ${product.name} en Papelería P de Papel.`,
    ),
    url: `${BASE_URL}${path}`,
    image: product.images?.map((image) => image.url) || [],
    sku: product.sku || product.id,
    ...(brand
      ? {
          brand: {
            "@type": "Brand",
            name: brand,
          },
        }
      : {}),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    ...(product.color?.name ? { color: product.color.name } : {}),
    ...(getStructuredProductSize(product)
      ? { size: getStructuredProductSize(product) }
      : {}),
    ...(product.design?.name ? { pattern: product.design.name } : {}),
    ...(includeGroupReference && product.productGroupId
      ? { inProductGroupWithID: product.productGroupId }
      : {}),
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}${path}`,
      priceCurrency: "COP",
      price: product.price,
      itemCondition: "https://schema.org/NewCondition",
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct(params.slug);

  if (!product) return notFound();

  const canonicalSlug = product.slug || product.id;
  if (params.slug !== canonicalSlug) {
    permanentRedirect(productPath(canonicalSlug));
  }

  const siblingsPromise = product.productGroupId
    ? getProducts({ productGroupId: product.productGroupId })
    : Promise.resolve({ products: [] });
  const suggestedProductsPromise = getProducts({
    categoryId: product.category?.id,
    excludeProducts: product.id,
    groupBy: "parents",
    limit: 4,
  });
  const siblingsResponse = await siblingsPromise;
  const siblings = siblingsResponse.products.map((variant) => ({
    id: variant.id,
    slug: variant.slug,
    size: variant.size,
    color: variant.color,
    design: variant.design,
    stock: variant.stock,
  }));
  const canonicalPath = productPath(canonicalSlug);
  const seenVariantCombinations = new Set<string>();
  const hasDuplicateVariantCombination = siblingsResponse.products.some(
    (variant) => {
      const combination = [
        variant.size?.id,
        variant.color?.id,
        variant.design?.id,
      ].join("|");

      if (seenVariantCombinations.has(combination)) return true;

      seenVariantCombinations.add(combination);
      return false;
    },
  );
  const hasVariants = Boolean(
    product.productGroupId &&
    siblingsResponse.products.length > 1 &&
    !hasDuplicateVariantCombination,
  );
  const productSchema = buildProductSchema(product, hasVariants);
  const jsonLd = hasVariants
    ? {
        "@context": "https://schema.org",
        "@type": "ProductGroup",
        name: product.productGroup?.name || product.name,
        description: createRichTextExcerpt(
          product.description,
          `Descubre ${product.name} en Papelería P de Papel.`,
        ),
        productGroupID: product.productGroupId,
        variesBy: [
          "https://schema.org/color",
          "https://schema.org/size",
          "https://schema.org/pattern",
        ],
        hasVariant: siblingsResponse.products.map((variant) =>
          buildProductSchema(variant),
        ),
      }
    : {
        "@context": "https://schema.org",
        ...productSchema,
      };
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
        item: `${BASE_URL}/tienda`,
      },
      ...(product.category
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: product.category.name,
              item: `${BASE_URL}${categoryPath(product.category.slug || product.category.id)}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: product.category ? 4 : 3,
        name: product.name,
        item: `${BASE_URL}${canonicalPath}`,
      },
    ],
  };

  return (
    <>
      {!product.isArchived && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <SingleProductPage product={product} siblings={siblings} />
      <Container className="max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <Suspense fallback={<RelatedProductsSkeleton />}>
          <RelatedProducts productsPromise={suggestedProductsPromise} />
        </Suspense>
      </Container>
      <Newsletter />
    </>
  );
}
