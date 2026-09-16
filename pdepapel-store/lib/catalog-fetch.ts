import "server-only";

import { CATALOG_FETCH_CACHE } from "@/lib/catalog-cache";
import {
  buildCatalogSearchParams,
  normalizeProductsResponse,
  UNAVAILABLE_RESPONSE,
  type CatalogQuery,
} from "@/lib/catalog-params";
import { env } from "@/lib/env.mjs";
import { ProductsResponse } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;

/**
 * Única puerta al catálogo del administrador. La usan el render en servidor y
 * la ruta `/api/catalog`, así que ambos comparten caché y etiquetas.
 */
export async function fetchCatalogProducts(
  query: CatalogQuery,
): Promise<ProductsResponse> {
  const url = new URL(API_URL);
  url.search = buildCatalogSearchParams(query).toString();

  try {
    const response = await fetch(url, CATALOG_FETCH_CACHE);
    if (!response.ok) return UNAVAILABLE_RESPONSE;
    return normalizeProductsResponse(await response.json());
  } catch {
    return UNAVAILABLE_RESPONSE;
  }
}
