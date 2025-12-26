import { getProducts } from "@/actions/get-products";
import { env } from "@/lib/env.mjs";
import { SearchResponse } from "@/types";

const URL = `${env.NEXT_PUBLIC_API_URL}/search/products`;

export const searchProducts = async (
  query: string,
): Promise<SearchResponse> => {
  // If query is empty, return featured products as initial suggestions
  if (!query.trim()) {
    const { products } = await getProducts({
      isFeatured: true,
      limit: 5,
    });

    // Map Product[] to SearchResult[]
    return products.map((product) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      minPrice: product.minPrice,
      isGroup: product.isGroup,
      image: product.images?.[0] || { url: "", isMain: true, id: "" }, // Fallback or map correctly
    }));
  }

  const res = await fetch(`${URL}?search=${query}`);

  const data = await res.json();

  return data;
};
