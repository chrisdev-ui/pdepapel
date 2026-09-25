import {
  buildCatalogSearchParams,
  normalizeProductsResponse,
  UNAVAILABLE_RESPONSE,
  type CatalogQuery,
} from "@/lib/catalog-params";
import { Product, ProductsResponse } from "@/types";

export const CATALOG_ENDPOINT = "/api/catalog";
export const PRODUCT_ENDPOINT = "/api/producto";

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

/**
 * Un producto desde el navegador (cambio de variante en la ficha). Va por la
 * ruta de la tienda y no directo al administrador para que la descripción
 * llegue saneada del servidor. `null` cuando no existe; cualquier otro fallo
 * se lanza, que es lo que la ficha convierte en aviso.
 */
export async function fetchProductFromClient(slug: string): Promise<Product | null> {
  const response = await fetch(`${PRODUCT_ENDPOINT}/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Producto ${response.status}`);
  return (await response.json()) as Product;
}
