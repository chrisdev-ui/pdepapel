import {
  buildCatalogSearchParams,
  normalizeProductsResponse,
  UNAVAILABLE_RESPONSE,
  type CatalogQuery,
} from "@/lib/catalog-params";
import { ProductsResponse } from "@/types";

export const CATALOG_ENDPOINT = "/api/catalog";

/**
 * Catálogo desde el navegador. Va por una ruta normal —no por una server
 * action— para que `signal` cancele de verdad y para que una consulta no se
 * quede colgada detrás de otra cuando cambia la URL de los filtros.
 */
export async function fetchCatalogFromClient(
  query: CatalogQuery,
  signal?: AbortSignal,
): Promise<ProductsResponse> {
  const params = buildCatalogSearchParams(query).toString();
  const response = await fetch(
    params ? `${CATALOG_ENDPOINT}?${params}` : CATALOG_ENDPOINT,
    { signal },
  );

  if (!response.ok) return UNAVAILABLE_RESPONSE;
  return normalizeProductsResponse(await response.json());
}
