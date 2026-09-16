import { fetchCatalogProducts } from "@/lib/catalog-fetch";
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
