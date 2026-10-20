import type { CatalogQuery } from "@/lib/catalog-params";

export const CATALOG_CACHE_REVALIDATE_SECONDS = 300;

/**
 * Etiquetas de la caché de datos del catálogo. Son un contrato con el panel
 * (`pdepapel-admin/lib/storefront-cache-scope.ts`): el panel purga solo las
 * del producto que cambió, y `products` queda para los cambios que tocan todo
 * el catálogo (ofertas, atributos).
 */
export const PRODUCTS_TAG = "products";
export const PRODUCT_LIST_TAG = "products:list";
export const FEATURED_PRODUCTS_TAG = "products:featured";
export const productTag = (key: string) => `product:${key}`;
export const productGroupTag = (groupId: string) => `products:group:${groupId}`;
export const productCategoryTag = (category: string) => `products:category:${category}`;
export const productTypeTag = (type: string) => `products:type:${type}`;
/** Lista de marcas visibles (menú, /marcas, filtros, sitemap). */
export const BRANDS_TAG = "brands";
/** La edición de cápsulas LIVE (menú, banner del inicio, /capsulas); el panel la purga al abrir o cerrar una. */
export const CAPSULES_TAG = "capsules";
/** Una página de marca (`GET /brands/{slug}`). */
export const brandTag = (slug: string) => `brand:${slug}`;

/**
 * Las listas acotadas a un grupo, categoría o tipo llevan solo esa etiqueta,
 * así el cambio de un producto no borra las fichas de otras categorías (que
 * piden sus sugeridos por categoría). Lo demás es la lista general.
 */
export function catalogListingTags(query: CatalogQuery): string[] {
  const tags = [PRODUCTS_TAG];
  if (query.productGroupId) tags.push(productGroupTag(query.productGroupId));
  if (query.categoryId) tags.push(productCategoryTag(query.categoryId));
  if (query.typeId) tags.push(productTypeTag(query.typeId));
  if (query.isFeatured) tags.push(FEATURED_PRODUCTS_TAG);
  // Asignar una marca purga `products:list`: una lista por marca debe llevarla aunque vaya acotada.
  if (tags.length === 1 || query.marca) tags.push(PRODUCT_LIST_TAG);
  return tags;
}

export const catalogFetchCache = (tags: string[]) => ({
  next: { revalidate: CATALOG_CACHE_REVALIDATE_SECONDS, tags },
});

export const CATALOG_FETCH_CACHE = catalogFetchCache([PRODUCTS_TAG, PRODUCT_LIST_TAG]);
