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

export function generateSemanticSKU(
  categoryName: string,
  designName: string,
  colorName: string,
  sizeName: string,
): string {
  const catSlug = cleanSlug(categoryName);
  const desSlug = cleanSlug(designName);
  const colSlug = cleanSlug(colorName);
  const sizeSlug = cleanSlugFull(sizeName);
  const sequence = Math.floor(1000 + Math.random() * 9000);

  return `${catSlug}-${desSlug}-${colSlug}-${sizeSlug}-${sequence}`;
}

export function generateVariants(params: GenerationParams): GeneratedVariant[] {
  const { category, designs, colors, sizes } = params;
  const variants: GeneratedVariant[] = [];

  // Format: CATEGORY(3) - DESIGN(3) - COLOR(3) - SIZE(Full) - RANDOM(4)
  // Example: TSH - SUM - RED - XL - 8821

  for (const design of designs) {
    for (const color of colors) {
      for (const size of sizes) {
        // Generated Name
        // e.g. "T-Shirt Summer Red XL"
        const name = `${category.name} ${design.name} ${color.name} ${size.value || size.name}`;

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
