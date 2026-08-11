import { Product, ProductVariant } from "@/types";

type Variant = Product | ProductVariant;

export function getStableProductVariants(
  product: Product,
  siblings?: ProductVariant[],
): Variant[] {
  const variants = siblings ? [...siblings] : [];
  const seenVariantIds = new Set<string>();
  const uniqueVariants = variants.filter((variant) => {
    if (seenVariantIds.has(variant.id)) return false;

    seenVariantIds.add(variant.id);
    return true;
  });

  if (!seenVariantIds.has(product.id)) {
    uniqueVariants.push(product);
  }

  return uniqueVariants;
}
