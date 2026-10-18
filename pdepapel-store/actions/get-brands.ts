import { cache } from "react";

import { BRANDS_TAG, brandTag, CATALOG_CACHE_REVALIDATE_SECONDS } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
import type { BrandPageData, BrandSummary } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/brands`;

/** Marcas visibles con productos activos, en el orden del panel. Sin respuesta: lista vacía (las marcas son opcionales). */
export const getBrands = cache(async (): Promise<BrandSummary[]> => {
  try {
    const response = await fetch(`${API_URL}?conProductos=1`, {
      next: { revalidate: CATALOG_CACHE_REVALIDATE_SECONDS, tags: [BRANDS_TAG, "catalog"] },
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? (payload as BrandSummary[]) : [];
  } catch {
    return [];
  }
});

export type BrandLookup = { kind: "brand"; brand: BrandPageData } | { kind: "redirect"; slug: string } | { kind: "missing" };

/** Una marca para /marcas/[slug]: la marca, la dirección actual si el slug es viejo, o nada (oculta, archivada o inexistente). */
export const getBrand = cache(async (slug: string): Promise<BrandLookup> => {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/${encodeURIComponent(slug)}`, {
      next: { revalidate: CATALOG_CACHE_REVALIDATE_SECONDS, tags: [brandTag(slug), BRANDS_TAG, "catalog"] },
    });
  } catch {
    throw new UpstreamServiceError("las marcas");
  }
  if (response.status === 404) return { kind: "missing" };
  if (!response.ok) throw new UpstreamServiceError("las marcas", response.status);
  const payload = (await response.json()) as BrandPageData | { redirectTo?: string };
  if ("redirectTo" in payload && typeof payload.redirectTo === "string") return { kind: "redirect", slug: payload.redirectTo };
  return { kind: "brand", brand: payload as BrandPageData };
});
