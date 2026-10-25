import { isCachedListingRender } from "@/lib/cached-listing";
import { fetchCatalogProducts, fetchCatalogProductsOrThrow } from "@/lib/catalog-fetch";
import type { CatalogQuery } from "@/lib/catalog-params";
import { ProductsResponse } from "@/types";

/**
 * Catálogo para el render en servidor. Ya no es una server action: el cliente
 * pasa por `/api/catalog`, que sí se puede cancelar y no entra en la cola de
 * acciones de Next.
 */
export const getProducts = async (
  query: CatalogQuery,
): Promise<ProductsResponse> => fetchCatalogProducts(query);

/**
 * El catálogo de un listado. En su copia ISR un fallo del panel lanza, para
 * que Next siga sirviendo la última copia buena; con filtros (render sin
 * caché) muestra «no disponible».
 */
export const getListingProducts = (
  searchParams: object,
  query: CatalogQuery,
): Promise<ProductsResponse> =>
  isCachedListingRender(searchParams) ? fetchCatalogProductsOrThrow(query) : fetchCatalogProducts(query);
