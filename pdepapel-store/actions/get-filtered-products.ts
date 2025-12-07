"use server";

import { env } from "@/lib/env.mjs";
import { Product } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/search/products`;

interface Query {
  search?: string;
  page?: number;
  limit?: number;
}

export const getFilteredProducts = async (query: Query): Promise<Product[]> => {
  const url = new URL(API_URL);

  if (query.search) url.searchParams.append("search", query.search);
  if (query.page) url.searchParams.append("page", String(query.page));
  if (query.limit) url.searchParams.append("limit", String(query.limit));

  const response = await fetch(url);
  return response.json();
};
