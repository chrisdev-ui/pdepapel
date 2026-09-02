import { env } from "@/lib/env.mjs";
import { CATALOG_FETCH_CACHE } from "@/lib/catalog-cache";

export type SitemapProduct = {
  id: string;
  slug?: string;
  updatedAt?: string;
  isArchived?: boolean;
};

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products/sitemap`;

export async function getSitemapProducts(): Promise<SitemapProduct[]> {
  const response = await fetch(API_URL, CATALOG_FETCH_CACHE);
  if (!response.ok) {
    throw new Error(
      `No fue posible cargar productos para sitemap (${response.status})`,
    );
  }

  const payload: unknown = await response.json();
  return Array.isArray(payload) ? (payload as SitemapProduct[]) : [];
}
