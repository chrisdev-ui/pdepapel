import { env } from "@/lib/env.mjs";
import { CATALOG_FETCH_CACHE } from "@/lib/catalog-cache";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
import { Product } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;

/** Destino de un producto archivado, tal como lo decide el panel. */
export type ArchivedProductRedirect =
  | { kind: "product"; slug: string }
  | { kind: "category"; slug: string }
  | { kind: "type"; id: string }
  | { kind: "shop" };

export type ProductRoute =
  | { product: Product; redirect?: undefined }
  | { product?: undefined; redirect: ArchivedProductRedirect }
  | null;

const isArchivedRedirect = (value: unknown): value is ArchivedProductRedirect => {
  if (!value || typeof value !== "object") return false;
  const redirect = value as Record<string, unknown>;
  if (redirect.kind === "shop") return true;
  if (redirect.kind === "type") return typeof redirect.id === "string" && redirect.id.length > 0;
  return (redirect.kind === "product" || redirect.kind === "category") && typeof redirect.slug === "string" && redirect.slug.length > 0;
};

/**
 * El producto, o a dónde mandar a quien lo pidió si está archivado (el panel
 * responde 404 con `redirect`). null: no existe, 404 real.
 */
export const getProductRoute = cache(async (id: string): Promise<ProductRoute> => {
  try {
    const response = await fetch(
      `${API_URL}/${id}?include=kitComponents&scope=storefront`,
      CATALOG_FETCH_CACHE,
    );
    if (response.status === 404) {
      const body = (await response.json().catch(() => null)) as { redirect?: unknown } | null;
      return isArchivedRedirect(body?.redirect) ? { redirect: body!.redirect as ArchivedProductRedirect } : null;
    }
    if (!response.ok) {
      throw new UpstreamServiceError("el catálogo", response.status);
    }
    return { product: (await response.json()) as Product };
  } catch (error) {
    if (error instanceof UpstreamServiceError) throw error;
    throw new UpstreamServiceError("el catálogo");
  }
});

/** Solo el producto vivo (la ficha y el cambio de variante); archivado = null. */
export const getProduct = cache(async (id: string): Promise<Product | null> => {
  const route = await getProductRoute(id);
  return route?.product ?? null;
});
