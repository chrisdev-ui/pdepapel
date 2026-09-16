import { useQuery } from "@tanstack/react-query";

import { fetchCatalogFromClient } from "@/lib/catalog-client";

export const useProductSiblings = (productGroupId?: string | null) => {
  const queryKey = ["product-siblings", productGroupId];

  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!productGroupId) return [];

      const { products } = await fetchCatalogFromClient(
        { productGroupId },
        signal,
      );

      return products;
    },
    enabled: !!productGroupId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
