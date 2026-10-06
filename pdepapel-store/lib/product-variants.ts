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

/**
 * URL de la foto principal de una variante (la marcada `isMain`, si no la
 * primera). Acepta las dos formas que llegan al selector: la hermana
 * recortada de la ficha (`image`) y el producto completo de la vista rápida
 * o de la variante actual (`images`).
 */
export function getVariantMainImageUrl(variant: {
  image?: string | null;
  images?: Array<{ url: string; isMain?: boolean }> | null;
}): string | null {
  if (variant.image !== undefined) return variant.image || null;
  const images = variant.images ?? [];
  return (images.find((image) => image.isMain) ?? images[0])?.url || null;
}

/**
 * Miniatura de cada opción de diseño: la foto principal de la variante a la
 * que lleva el clic. Si esa variante no tiene foto, o dos diseños llevan a la
 * misma foto (no ayudaría a distinguirlos), el diseño queda sin miniatura y
 * se muestra el chip de texto.
 */
export function getDesignThumbnails(
  designIds: string[],
  resolveImage: (designId: string) => string | null,
): Map<string, string | null> {
  const images = designIds.map((id) => [id, resolveImage(id)] as const);
  const uses = new Map<string, number>();
  for (const [, url] of images) if (url) uses.set(url, (uses.get(url) ?? 0) + 1);
  return new Map(images.map(([id, url]) => [id, url && uses.get(url) === 1 ? url : null]));
}
