import { getFilteredProducts } from "@/actions/get-filtered-products";
import { Product } from "@/types";
import { useInfiniteQuery } from "@tanstack/react-query";

function useFilteredProducts(searchTerm?: string) {
  const limit = 10;
  const queryKey = ["filteredProducts", searchTerm];

  const queryFn = async ({ pageParam = 1 }) => {
    return await getFilteredProducts({
      search: searchTerm,
      page: pageParam,
      limit,
    });
  };

  const getNextPageParam = (lastPage: Product[], allPages: Product[][]) => {
    if (lastPage.length < limit) {
      return undefined;
    }

    return allPages.length + 1;
  };

  return useInfiniteQuery({
    queryKey,
    queryFn,
    getNextPageParam,
    initialPageParam: 1,
  });
}

export default useFilteredProducts;
