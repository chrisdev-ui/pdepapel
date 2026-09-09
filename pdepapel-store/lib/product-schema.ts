import { BASE_URL } from "@/constants";
import { getAverageRating, isComingSoon } from "@/lib/product-card";
import { getStructuredProductSize } from "@/lib/product-options";
import { createRichTextExcerpt } from "@/lib/rich-text";
import { categoryPath, productPath } from "@/lib/routes";
import { Product, Review } from "@/types";

const MAX_SCHEMA_REVIEWS = 10;

/** Solo reseñas reales con calificación válida entran al marcado. */
function buildReviewSchema(reviews: Review[] | undefined) {
  const valid = (reviews ?? []).filter((review) => review.rating >= 1 && review.rating <= 5);
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
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
      ...(review.comment ? { reviewBody: review.comment } : {}),
      ...(review.createdAt ? { datePublished: review.createdAt } : {}),
    })),
  };
}

export function buildProductSchema(product: Product, includeGroupReference = true) {
  const slug = product.slug || product.id;
  const path = productPath(slug);
  const brand = product.brand || product.productGroup?.brand;
  const size = getStructuredProductSize(product);

  return {
    "@type": "Product",
    name: product.name,
    description: createRichTextExcerpt(product.description, `Descubre ${product.name} en Papelería P de Papel.`),
    url: `${BASE_URL}${path}`,
    image: product.images?.map((image) => image.url) || [],
    sku: product.sku || product.id,
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(product.gtin ? { gtin: product.gtin } : {}),
    ...(product.mpn ? { mpn: product.mpn } : {}),
    ...(product.color?.name ? { color: product.color.name } : {}),
    ...(size ? { size } : {}),
    ...(product.design?.name ? { pattern: product.design.name } : {}),
    ...(includeGroupReference && product.productGroupId ? { inProductGroupWithID: product.productGroupId } : {}),
    ...buildReviewSchema(product.reviews),
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}${path}`,
      priceCurrency: "COP",
      price: Number(product.price),
      itemCondition: "https://schema.org/NewCondition",
      availability: isComingSoon(product)
        ? "https://schema.org/PreOrder"
        : product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      ...(isComingSoon(product) && product.availableAt ? { availabilityStarts: product.availableAt } : {}),
    },
  };
}

/** Grupo con variantes cuando todas las combinaciones son distintas; si no, el producto suelto. */
export function buildProductJsonLd(product: Product, siblings: Product[]) {
  const seen = new Set<string>();
  const hasDuplicateCombination = siblings.some((variant) => {
    const combination = [variant.size?.id, variant.color?.id, variant.design?.id].join("|");
    if (seen.has(combination)) return true;
    seen.add(combination);
    return false;
  });
  const hasVariants = Boolean(product.productGroupId && siblings.length > 1 && !hasDuplicateCombination);

  if (!hasVariants) {
    return { "@context": "https://schema.org", ...buildProductSchema(product, false) };
  }

  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    name: product.productGroup?.name || product.name,
    description: createRichTextExcerpt(product.description, `Descubre ${product.name} en Papelería P de Papel.`),
    productGroupID: product.productGroupId,
    variesBy: ["https://schema.org/color", "https://schema.org/size", "https://schema.org/pattern"],
    hasVariant: siblings.map((variant) => buildProductSchema(variant)),
  };
}

export function buildProductBreadcrumbJsonLd(product: Product) {
  const canonicalPath = productPath(product.slug || product.id);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Tienda", item: `${BASE_URL}/tienda` },
      ...(product.category
        ? [{ "@type": "ListItem", position: 3, name: product.category.name, item: `${BASE_URL}${categoryPath(product.category.slug || product.category.id)}` }]
        : []),
      { "@type": "ListItem", position: product.category ? 4 : 3, name: product.name, item: `${BASE_URL}${canonicalPath}` },
    ],
  };
}
