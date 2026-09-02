import { normalizeCatalogOptionKey } from "@/lib/catalog-option-key";
import type { ProductCatalogAttribute } from "@/lib/product-image-analysis";

export function mergeProductCatalogAttributes(
  existing: ProductCatalogAttribute[],
  approved: ProductCatalogAttribute[],
  maxAttributes = 8,
) {
  const merged = existing.slice(0, maxAttributes);

  approved.forEach((attribute) => {
    const normalizedKey = normalizeCatalogOptionKey(attribute.key);
    const existingIndex = merged.findIndex(
      (current) => normalizeCatalogOptionKey(current.key) === normalizedKey,
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = attribute;
    } else if (merged.length < maxAttributes) {
      merged.push(attribute);
    }
  });

  return merged;
}
