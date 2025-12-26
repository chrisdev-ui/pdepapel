import { useQuery } from "@tanstack/react-query";

import { getProducts } from "@/actions/get-products";
import { ProductVariant } from "@/types";

export const useProductSiblings = (productGroupId?: string | null) => {
  const queryKey = ["product-siblings", productGroupId];

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!productGroupId) return [];

      const { products } = await getProducts({
        productGroupId,
      });

      return products;
    },
    enabled: !!productGroupId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
