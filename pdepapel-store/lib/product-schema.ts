import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { CLOUDINARY_MAX_WIDTH, getCloudinaryImageUrl } from "@/lib/cloudinary-loader";

import { getPurchasableUnits } from "@/lib/purchasable-units";
import { BASE_URL } from "@/constants";
import { buildFreeShippingDetails, buildMerchantReturnPolicy } from "@/lib/commerce-policies";
import { getAverageRating, isComingSoon } from "@/lib/product-card";
import { getStructuredProductSize } from "@/lib/product-options";
import { createRichTextExcerpt } from "@/lib/rich-text";
import { categoryPath, productPath } from "@/lib/routes";
import { Product, Review } from "@/types";

const MAX_SCHEMA_REVIEWS = 10;

/** Solo reseñas reales con calificación válida entran al marcado. */
function buildReviewSchema(reviews: Review[] | undefined) {
  const valid = (reviews ?? []).filter(
    (review) => review.rating >= 1 && review.rating <= 5,
  );
  const rating = getAverageRating(valid);
  if (!rating) return {};

  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: rating.average,
      reviewCount: rating.count,
      bestRating: 5,
      worstRating: 1,
    },
    review: valid.slice(0, MAX_SCHEMA_REVIEWS).map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.name },
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
      ...(review.comment ? { reviewBody: review.comment } : {}),
      ...(review.createdAt ? { datePublished: review.createdAt } : {}),
    })),
  };
}

export type ProductSchemaOptions = {
  /** `Store.freeShippingThreshold`: a partir de ahí el envío es gratis. */
  freeShippingThreshold?: number | null;
};

export function buildProductSchema(
  product: Product,
  includeGroupReference = true,
  options: ProductSchemaOptions = {},
) {
  const slug = product.slug || product.id;
  const path = productPath(slug);
  const brand = product.brand || product.productGroup?.brand;
  const size = getStructuredProductSize(product);
  const price = Number(product.price);
  const shippingDetails = buildFreeShippingDetails(price, options.freeShippingThreshold);

  return {
    "@type": "Product",
    name: product.name,
    description: createRichTextExcerpt(
      product.description,
      `Descubre ${product.name} en Papelería P de Papel.`,
    ),
    url: `${BASE_URL}${path}`,
    // La copia de 1600 px de la galería; Google la baja para Imágenes y Merchant.
    image: product.images?.map((image) => getCloudinaryImageUrl(image.url, CLOUDINARY_MAX_WIDTH)) || [],
    sku: product.sku || product.id,
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    ...(product.color?.name ? { color: product.color.name } : {}),
    ...(size ? { size } : {}),
    ...(product.design?.name ? { pattern: product.design.name } : {}),
    ...(includeGroupReference && product.productGroupId
      ? { inProductGroupWithID: product.productGroupId }
      : {}),
    ...buildReviewSchema(product.reviews),
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}${path}`,
      priceCurrency: "COP",
      price,
      itemCondition: "https://schema.org/NewCondition",
      // Una preventa es PreOrder aunque la bodega esté en cero: se vende hoy
      // y llega en la fecha prometida.
      availability: product.presales?.[0]
        ? getPurchasableUnits(product) > 0
          ? "https://schema.org/PreOrder"
          : "https://schema.org/OutOfStock"
        : isComingSoon(product)
          ? "https://schema.org/PreOrder"
          : product.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
      ...(product.presales?.[0]
        ? { availabilityStarts: product.presales[0].expectedArrivalAt }
        : isComingSoon(product) && product.availableAt
          ? { availabilityStarts: product.availableAt }
          : {}),
      ...(shippingDetails ? { shippingDetails } : {}),
      hasMerchantReturnPolicy: buildMerchantReturnPolicy(),
    },
  };
}

const VARIANT_ATTRIBUTES = [
  ["color", "https://schema.org/color"],
  ["size", "https://schema.org/size"],
  ["pattern", "https://schema.org/pattern"],
] as const;

type VariantSchema = ReturnType<typeof buildProductSchema>;

/**
 * Atributos por los que el grupo varía de verdad, leídos del marcado que ve
 * Google: todas las variantes tienen valor y hay al menos dos distintos.
 * Declarar uno que no varía (o que a alguna variante le falta) hace que
 * Merchant exija el campo en cada variante: «Falta el campo "size"» dejó
 * 101 fichas no válidas cuando `variesBy` era fijo (2026-10-02).
 */
export function getVariesBy(variants: VariantSchema[]) {
  return VARIANT_ATTRIBUTES.filter(([key]) => {
    const values = variants.map((variant) => variant[key]);
    if (values.some((value) => !value)) return false;
    return new Set(values).size > 1;
  });
}

/**
 * Grupo con variantes cuando el grupo varía por algún atributo y cada
 * variante tiene una combinación distinta de esos atributos; si no, el
 * producto suelto.
 */
export function buildProductJsonLd(
  product: Product,
  siblings: Product[],
  options: ProductSchemaOptions = {},
) {
  const variants = siblings.map((variant) => buildProductSchema(variant, true, options));
  const variesBy = getVariesBy(variants);
  const combinations = new Set(
    variants.map((variant) => variesBy.map(([key]) => variant[key]).join("|")),
  );
  const hasVariants = Boolean(
    product.productGroupId &&
      siblings.length > 1 &&
      variesBy.length > 0 &&
      combinations.size === variants.length,
  );

  if (!hasVariants) {
    return {
      "@context": "https://schema.org",
      ...buildProductSchema(product, false, options),
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    name: product.productGroup?.name || product.name,
    description: createRichTextExcerpt(
      product.description,
      `Descubre ${product.name} en Papelería P de Papel.`,
    ),
    productGroupID: product.productGroupId,
    variesBy: variesBy.map(([, url]) => url),
    hasVariant: variants,
  };
}

export function buildProductBreadcrumbJsonLd(product: Product) {
  const canonicalPath = productPath(product.slug || product.id);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
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
              name: stripTaxonomyIcon(product.category.name),
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
}
