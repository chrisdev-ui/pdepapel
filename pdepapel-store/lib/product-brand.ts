import type { Product, PublicBrand } from "@/types";

// Aparte de `brand-display`: la tarjeta, la ficha y la analítica solo
// necesitan esto, y así no arrastran al bundle del cliente los ayudantes del
// catálogo (chips, filtros, página de marca). Un texto viejo guardado en el
// navegador no tiene `isPublic` ni `name`, así que no cuenta como marca.

/** La marca del producto (o de su grupo). */
export function productBrand(product: Pick<Product, "brand" | "productGroup">): PublicBrand | null {
  return product.brand || product.productGroup?.brand || null;
}

/** La marca que se puede mostrar en la tienda: solo visible y sin archivar. */
export function publicProductBrand(product: Pick<Product, "brand" | "productGroup">): PublicBrand | null {
  const brand = productBrand(product);
  return brand?.isPublic ? brand : null;
}

/** Nombre para datos (JSON-LD, GA4): también de una marca oculta. */
export function brandDataName(product: Pick<Product, "brand" | "productGroup">): string | undefined {
  return productBrand(product)?.name || undefined;
}
