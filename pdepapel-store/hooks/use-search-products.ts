import { searchProducts } from "@/actions/search-products";
import { useQuery } from "@tanstack/react-query";

export default function useSearchProducts(searchTerm?: string) {
  const queryKey = ["searchProducts", searchTerm];

  return useQuery({
    queryKey,
    queryFn: async () => {
      // Pass empty string if searchTerm is undefined
      const query = searchTerm || "";
      const result = await searchProducts(query);

      // Robust handling for Array or Object response
      if (Array.isArray(result)) {
        return result;
      }

      // @ts-ignore - Handle potential object wrapper
      if (result?.products && Array.isArray(result.products)) {
        // @ts-ignore
        return result.products;
      }

      return [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: false,
  });
}
