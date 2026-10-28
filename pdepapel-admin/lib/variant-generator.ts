import {
  buildProductVariantNameSuggestion,
  getCustomerFacingSizeName,
} from "@/lib/product-naming";

export interface VariantOption {
  id: string;
  name: string;
  value?: string;
}

export interface GenerationParams {
  category: VariantOption;
  designs: VariantOption[];
  colors: VariantOption[];
  sizes: VariantOption[];
  baseName?: string;
  includeColorInName?: boolean;
  includeDesignInName?: boolean;
}

export interface GeneratedVariant {
  categoryId: string;
  designId: string;
  colorId: string;
  sizeId: string;
  sku: string;
  name: string;
}

export function cleanSlug(text: string): string {
  let cleaned = text
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "") // Space to empty (remove spaces to form acronyms like MYM)
    .replace(/[^A-Z0-9-]/g, "") // Remove non-alphanumeric
    .replace(/-+/g, "-") // Consolidate dashes
    .replace(/^-+|-+$/g, ""); // strip leading/trailing

  // Take first 3 chars
  cleaned = cleaned.slice(0, 3);

  // If slicing resulted in a trailing dash (e.g. "EL-"), remove it
  if (cleaned.endsWith("-")) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned;
}

export function cleanSlugFull(text: string): string {
  return text
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-") // Consolidate dashes
    .replace(/^-+|-+$/g, ""); // strip leading/trailing
}

/** Cola de 6 caracteres en base 36 (≈2.200 millones): con 4 cifras, dos variantes iguales chocaban 1 de cada 9.000. */
export const SKU_SUFFIX_LENGTH = 6;

export function skuSuffix(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < SKU_SUFFIX_LENGTH; i += 1) out += Math.floor(random() * 36).toString(36);
  return out.toUpperCase();
}

export function generateSemanticSKU(
  categoryName: string,
  designName: string,
  colorName: string,
  sizeName: string,
  random: () => number = Math.random,
): string {
  const catSlug = cleanSlug(categoryName);
  const desSlug = cleanSlug(designName);
  const colSlug = cleanSlug(colorName);
  const sizeSlug = cleanSlugFull(sizeName);

  return `${catSlug}-${desSlug}-${colSlug}-${sizeSlug}-${skuSuffix(random)}`;
}

export function generateVariants(params: GenerationParams): GeneratedVariant[] {
  const {
    baseName,
    category,
    designs,
    colors,
    sizes,
    includeColorInName = false,
    includeDesignInName = false,
  } = params;
  const variants: GeneratedVariant[] = [];

  // Format: CATEGORY(3) - DESIGN(3) - COLOR(3) - SIZE(Full) - RANDOM(6, base 36)
  // Example: TSH - SUM - RED - XL - 8K2Q1Z

  for (const design of designs) {
    for (const color of colors) {
      for (const size of sizes) {
        const name = buildProductVariantNameSuggestion({
          baseName,
          categoryName: category.name,
          designName: design.name,
          colorName: color.name,
          sizeName: getCustomerFacingSizeName({
            categoryName: category.name,
            sizeName: size.name,
            sizeValue: size.value,
          }),
          sizeValue: size.value,
          includeColorInName,
          includeDesignInName,
        }).name;

        const sku = generateSemanticSKU(
          category.name,
          design.name,
          color.name,
          size.value || size.name,
        );

        variants.push({
          categoryId: category.id,
          designId: design.id,
          colorId: color.id,
          sizeId: size.id,
          sku,
          name,
        });
      }
    }
  }

  return variants;
}
