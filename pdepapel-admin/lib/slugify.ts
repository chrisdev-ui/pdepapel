export function slugify(text: string): string {
  if (!text) return "";

  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const LOGISTICS_SIZE_VALUE_PATTERN = /^(?:XXS|XS|S|M|L|XL|XXL)-(?:L|P)$/i;
const INTERNAL_SIZE_CODE_PATTERN = /^(?:XXS|XS|S|M|L|XL|XXL)\+$/i;

function isCustomerFacingSize(size?: { name?: string; value?: string } | null) {
  const sizeName = size?.name?.trim();
  const sizeValue = size?.value?.trim();

  if (!sizeName) return false;

  return !(
    LOGISTICS_SIZE_VALUE_PATTERN.test(sizeName) ||
    LOGISTICS_SIZE_VALUE_PATTERN.test(sizeValue || "") ||
    INTERNAL_SIZE_CODE_PATTERN.test(sizeName)
  );
}

export function generateProductSlug(product: {
  name: string;
  color?: { name?: string; value?: string } | null;
  design?: { name?: string } | null;
  size?: { name?: string; value?: string } | null;
  includeVariantAttributes?: boolean;
  variantAttributes?: {
    color?: boolean;
    design?: boolean;
    size?: boolean;
  };
}): string {
  const base = slugify(product.name);

  if (!product.includeVariantAttributes) {
    return base;
  }

  const attributes: string[] = [];

  if (
    product.variantAttributes?.design !== false &&
    product.design?.name &&
    product.design.name !== "S-D" &&
    product.design.name !== "Sin Diseño" &&
    product.design.name !== "Estándar"
  ) {
    attributes.push(product.design.name);
  }
  if (
    product.variantAttributes?.color !== false &&
    product.color?.name &&
    product.color.name !== "S-C" &&
    product.color.name !== "Sin Color"
  ) {
    attributes.push(product.color.name);
  }
  if (
    product.variantAttributes?.size !== false &&
    product.size?.name &&
    product.size.name !== "Sin Tamaño" &&
    product.size.name !== "Estándar" &&
    product.size.name !== "Única" &&
    isCustomerFacingSize(product.size)
  ) {
    attributes.push(product.size.name);
  }

  if (attributes.length > 0) {
    const baseTokens = new Set(base.split("-").filter(Boolean));
    const missingAttributeTokens = slugify(attributes.join(" "))
      .split("-")
      .filter((token) => token && !baseTokens.has(token));

    if (missingAttributeTokens.length > 0) {
      return `${base}-${missingAttributeTokens.join("-")}`;
    }
  }

  return base;
}
