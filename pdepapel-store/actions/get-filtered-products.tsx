import { env } from "@/lib/env.mjs";
import { Product } from "@/types";
import qs from "query-string";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/search/products`;

interface Query {
  search?: string;
  page?: number;
  limit?: number;
}

export const getFilteredProducts = async (query: Query): Promise<Product[]> => {
  const url = qs.stringifyUrl({
    url: API_URL,
    query: {
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
  });

  const response = await fetch(url);
  return response.json();
};
