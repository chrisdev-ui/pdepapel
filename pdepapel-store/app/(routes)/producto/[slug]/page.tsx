import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { getProduct } from "@/actions/get-product";
import { getProducts } from "@/actions/get-products";
import Newsletter from "@/components/newsletter";
import { RelatedProducts } from "@/components/related-products";
import { RelatedProductsSkeleton } from "@/components/related-products-skeleton";
import { SingleProductPage } from "@/components/single-product-page";
import { Container } from "@/components/ui/container";
import { BASE_URL } from "@/constants";
import { EARLY_ACCESS_COOKIE } from "@/lib/early-access";
import { getStructuredProductSize } from "@/lib/product-options";
import { buildProductBreadcrumbJsonLd, buildProductJsonLd } from "@/lib/product-schema";
import { createRichTextExcerpt } from "@/lib/rich-text";
import { categoryPath, productPath } from "@/lib/routes";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";

interface ProductPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) notFound();

  const canonicalPath = productPath(product.slug || product.id);
  const images = (product.images ?? []).map((image, index) => ({
    url: image.url,
    alt: index === 0 ? product.name : `${product.name}, vista ${index + 1}`,
  }));
  const variantAttributes = [product.design?.name, product.color?.name, getStructuredProductSize(product)].filter(Boolean).join(", ");
  const title = variantAttributes ? `${product.name} - ${variantAttributes}` : product.name;
  const description = createRichTextExcerpt(
    product.description,
    `Descubre ${product.name} en Papelería P de Papel. Papelería kawaii y de oficina con envío a toda Colombia.`,
  );

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalPath },
    robots: product.isArchived ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url: `${BASE_URL}${canonicalPath}`, siteName: "Papelería P de Papel", locale: "es_CO", type: "website", images },
    twitter: { title, description, card: "summary_large_image", site: "Papelería P de Papel", images },
  };
}

export const revalidate = 300;

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct(params.slug);
  if (!product) return notFound();

  const canonicalSlug = product.slug || product.id;
  if (params.slug !== canonicalSlug) permanentRedirect(productPath(canonicalSlug));

  const siblingsPromise = product.productGroupId ? getProducts({ productGroupId: product.productGroupId }) : Promise.resolve({ products: [] });
  const suggestedProductsPromise = getProducts({ categoryId: product.category?.id, excludeProducts: product.id, groupBy: "parents", limit: 4 });
  const siblingsResponse = await siblingsPromise;
  const siblings = siblingsResponse.products.map((variant) => ({
    id: variant.id,
    slug: variant.slug,
    size: variant.size,
    color: variant.color,
    design: variant.design,
    stock: variant.stock,
  }));
  const hasEarlyAccess = Boolean(cookies().get(EARLY_ACCESS_COOKIE)?.value);
  const categoryName = product.category ? stripTaxonomyIcon(product.category.name) : null;

  return (
    <>
      {!product.isArchived && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(product, siblingsResponse.products)) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductBreadcrumbJsonLd(product)) }} />
        </>
      )}
      <SingleProductPage product={product} siblings={siblings} earlyAccess={hasEarlyAccess} />
      <Container className="max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <Suspense fallback={<RelatedProductsSkeleton />}>
          <RelatedProducts
            productsPromise={suggestedProductsPromise}
            eyebrow="Completa tu set"
            title={categoryName ? `Combinan con este producto` : "También te puede gustar"}
            action={product.category ? { label: `Ver ${categoryName}`, href: categoryPath(product.category.slug || product.category.id) } : undefined}
          />
        </Suspense>
      </Container>
      <Newsletter />
    </>
  );
}
