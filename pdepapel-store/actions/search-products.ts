import { fetchCatalogFromClient } from "@/lib/catalog-client";
import { env } from "@/lib/env.mjs";
import { SearchResponse } from "@/types";

const URL = `${env.NEXT_PUBLIC_API_URL}/search/products`;

export const searchProducts = async (
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> => {
  try {
    // If query is empty, return featured products as initial suggestions
    if (!query.trim()) {
      const { products } = await fetchCatalogFromClient(
        { isFeatured: true, limit: 5 },
        signal,
      );

      // Map Product[] to SearchResult[]
      return products.map((product) => ({
        id: product.id,
        slug: product.slug || product.id,
        name: product.name,
        price: product.price,
        minPrice: product.minPrice,
        isGroup: product.isGroup,
        image: product.images?.[0] || { url: "", isMain: true, id: "" }, // Fallback or map correctly
      }));
    }

    const res = await fetch(`${URL}?search=${query}`, { signal });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};
