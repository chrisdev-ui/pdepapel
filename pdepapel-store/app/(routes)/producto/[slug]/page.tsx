import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { getProductRoute } from "@/actions/get-product";
import { getProducts } from "@/actions/get-products";
import { getStorefrontSettings } from "@/actions/get-storefront-settings";
import Newsletter from "@/components/newsletter";
import { RelatedProducts } from "@/components/related-products";
import { RelatedProductsSkeleton } from "@/components/related-products-skeleton";
import { SingleProductPage } from "@/components/single-product-page";
import { Container } from "@/components/ui/container";
import { BASE_URL } from "@/constants";
import { CLOUDINARY_MAX_WIDTH, getCloudinaryImageUrl } from "@/lib/cloudinary-loader";
import { buildProductMetaDescription, buildProductMetaTitle } from "@/lib/product-metadata";
import { withSanitizedDescription } from "@/lib/product-description";
import { getVariantMainImageUrl } from "@/lib/product-variants";
import { buildProductBreadcrumbJsonLd, buildProductJsonLd } from "@/lib/product-schema";
import { categoryPath, productPath } from "@/lib/routes";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { archivedProductRedirectPath } from "@/lib/archived-product-redirect";

interface ProductPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const route = await getProductRoute(params.slug);
  if (route?.redirect) permanentRedirect(archivedProductRedirectPath(route.redirect));
  const product = route?.product;
  if (!product) notFound();
  const [siblingsResponse, storefrontSettings] = await Promise.all([
    product.productGroupId ? getProducts({ productGroupId: product.productGroupId }) : Promise.resolve({ products: [] }),
    getStorefrontSettings(),
  ]);

  const canonicalPath = productPath(product.slug || product.id);
  // Vista previa social: la copia de 1600 px que ya existe para la galería, no el
  // original completo (WhatsApp, Facebook e Instagram lo bajaban por cada envío).
  const images = (product.images ?? []).map((image, index) => ({
    url: getCloudinaryImageUrl(image.url, CLOUDINARY_MAX_WIDTH),
    alt: index === 0 ? product.name : `${product.name}, vista ${index + 1}`,
  }));
  const title = buildProductMetaTitle(product, siblingsResponse.products);
  const description = buildProductMetaDescription(product, {
    siblings: siblingsResponse.products,
    freeShippingThreshold: storefrontSettings.freeShippingThreshold,
  });

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

/**
 * Lista vacía a propósito: no se prerenderiza nada en el build, pero declarar
 * `generateStaticParams` es lo que hace que Next 14 guarde cada ficha en la
 * caché ISR la primera vez que alguien la pide. Sin esta función la ruta se
 * renderizaba en cada visita (`no-store`) pese a `revalidate`.
 *
 * Las 308 de alias y de rutas por UUID también quedan en caché. Vercel guarda
 * la respuesta completa y conserva `Location`; `next start` en local la
 * sirve sin `Location` desde la caché, así que esa prueba no sirve aquí.
 */
export function generateStaticParams() {
  return [];
}

export default async function ProductPage({ params }: ProductPageProps) {
  const route = await getProductRoute(params.slug);
  // Archivado: 308 a lo más parecido que siga a la venta (hermana, categoría,
  // tipo o tienda). Inexistente: 404 real.
  if (route?.redirect) permanentRedirect(archivedProductRedirectPath(route.redirect));
  const fetched = route?.product;
  if (!fetched) return notFound();
  // La descripción se sanea aquí, una vez, y cruza al cliente lista para
  // pintarse: `RichTextDisplay` ya no lleva el saneador al navegador.
  const product = withSanitizedDescription(fetched);

  const canonicalSlug = product.slug || product.id;
  if (params.slug !== canonicalSlug) permanentRedirect(productPath(canonicalSlug));

  const siblingsPromise = product.productGroupId ? getProducts({ productGroupId: product.productGroupId }) : Promise.resolve({ products: [] });
  const suggestedProductsPromise = getProducts({ categoryId: product.category?.id, excludeProducts: product.id, groupBy: "parents", limit: 4 });
  const [siblingsResponse, storefrontSettings] = await Promise.all([siblingsPromise, getStorefrontSettings()]);
  const siblings = siblingsResponse.products.map((variant) => ({
    id: variant.id,
    slug: variant.slug,
    size: variant.size,
    color: variant.color,
    design: variant.design,
    stock: variant.stock,
    // Solo la URL de la foto principal: la miniatura del selector de diseño
    // pide la misma copia w_128 que la barra fija (docs/imagenes-cloudinary.md).
    image: getVariantMainImageUrl(variant),
  }));
  const categoryName = product.category ? stripTaxonomyIcon(product.category.name) : null;

  return (
    <>
      {!product.isArchived && (
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(product, siblingsResponse.products, { freeShippingThreshold: storefrontSettings.freeShippingThreshold })) }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductBreadcrumbJsonLd(product)) }} />
        </>
      )}
      <SingleProductPage product={product} siblings={siblings} />
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
