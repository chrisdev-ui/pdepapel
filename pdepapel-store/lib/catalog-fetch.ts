import "server-only";

import * as React from "react";

import { catalogFetchCache, catalogListingTags, withUpstreamTimeout } from "@/lib/catalog-cache";
import {
  buildCatalogSearchParams,
  normalizeProductsResponse,
  parseCatalogSearchParams,
  UNAVAILABLE_RESPONSE,
  type CatalogQuery,
} from "@/lib/catalog-params";
import { publicEnv as env } from "@/lib/public-env";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
import { ProductsResponse } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;

// Un `fetch` con su propia señal ya no lo deduplica React; `cache` lo vuelve a
// pedir una sola vez por render (metadatos y página piden la misma lista). Las
// pruebas cargan React 18.2, que no trae `cache`.
const memoizePerRender: typeof React.cache = React.cache ?? ((fn) => fn);

const requestCatalog = memoizePerRender(async (search: string): Promise<ProductsResponse> => {
  const url = new URL(API_URL);
  url.search = search;
  const tags = catalogListingTags(parseCatalogSearchParams(new URLSearchParams(search)));

  let response: Response;
  try {
    response = await fetch(url, withUpstreamTimeout(catalogFetchCache(tags)));
  } catch {
    throw new UpstreamServiceError("el catálogo");
  }
  if (!response.ok) throw new UpstreamServiceError("el catálogo", response.status);
  const products = normalizeProductsResponse(await response.json());
  if (products.isUnavailable) throw new UpstreamServiceError("el catálogo");
  return products;
});

/**
 * Para las copias ISR de los listados: si el panel falla, lanza. Next deja de
 * regenerar y sigue sirviendo la última copia buena, en vez de guardar
 * «no disponible» para todos durante cinco minutos.
 */
export function fetchCatalogProductsOrThrow(query: CatalogQuery): Promise<ProductsResponse> {
  return requestCatalog(buildCatalogSearchParams(query).toString());
}

/**
 * Única puerta al catálogo del administrador. La usan el render en servidor y
 * la ruta `/api/catalog`, así que ambos comparten caché y etiquetas. Un fallo
 * es el estado «no disponible»: solo para renders sin caché.
 */
export async function fetchCatalogProducts(
  query: CatalogQuery,
): Promise<ProductsResponse> {
  try {
    return await fetchCatalogProductsOrThrow(query);
  } catch {
    return UNAVAILABLE_RESPONSE;
  }
}
