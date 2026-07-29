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

export function generateProductSlug(product: {
  name: string;
  color?: { name?: string; value?: string } | null;
  design?: { name?: string } | null;
  size?: { name?: string; value?: string } | null;
}): string {
  const base = slugify(product.name);

  const attributes: string[] = [];

  if (
    product.design?.name &&
    product.design.name !== "S-D" &&
    product.design.name !== "Sin Diseño" &&
    product.design.name !== "Estándar"
  ) {
    attributes.push(product.design.name);
  }
  if (
    product.color?.name &&
    product.color.name !== "S-C" &&
    product.color.name !== "Sin Color"
  ) {
    attributes.push(product.color.name);
  }
  if (
    product.size?.name &&
    product.size.name !== "S-P" &&
    product.size.name !== "Sin Tamaño" &&
    product.size.name !== "Estándar" &&
    product.size.name !== "Única"
  ) {
    attributes.push(product.size.name);
  }

  if (attributes.length > 0) {
    const attrSlug = slugify(attributes.join(" "));
    if (attrSlug && !base.includes(attrSlug)) {
      return `${base}-${attrSlug}`;
    }
  }

  return base;
}
