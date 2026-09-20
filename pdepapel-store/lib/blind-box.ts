import { Product } from "@/types";

/**
 * Cápsulas sorpresa: se venden sin decir qué traen dentro.
 *
 * Se reconocen por la categoría «Kits sorpresa», que es la misma que el panel
 * usa para esconderlas de los listados de stock. Va por `slug` y no por id
 * para que no haya un UUID copiado en dos aplicaciones: el slug es estable y
 * los renombres dejan alias.
 */
export const BLIND_BOX_CATEGORY_SLUG = "kits-sorpresa";

export function isBlindBox(product: Pick<Product, "category">): boolean {
  return product.category?.slug === BLIND_BOX_CATEGORY_SLUG;
}

/**
 * Lo que se promete y nada más: una cápsula trae un artículo, así que llevar
 * N cápsulas son N artículos. No se promete cuál, ni marca, ni color, ni que
 * dos cápsulas traigan cosas distintas.
 */
export function blindBoxFloor(quantity: number): string {
  const units = Math.max(1, Math.floor(quantity) || 1);
  return units === 1
    ? "1 artículo sorpresa"
    : `${units} artículos sorpresa`;
}
