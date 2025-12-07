"use server";

import { env } from "@/lib/env.mjs";
import { ProductsResponse } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;

interface Query {
  page?: number;
  typeId?: string;
  categoryId?: string;
  colorId?: string;
  sizeId?: string;
  designId?: string;
  isFeatured?: boolean;
  onlyNew?: boolean;
  fromShop?: boolean;
  limit?: number;
  itemsPerPage?: number;
  sortOption?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  excludeProducts?: string;
  search?: string;
}

export const getProducts = async (query: Query): Promise<ProductsResponse> => {
  const url = new URL(API_URL);

  if (query.colorId) url.searchParams.append("colorId", query.colorId);
  if (query.typeId) url.searchParams.append("typeId", query.typeId);
  if (query.categoryId) url.searchParams.append("categoryId", query.categoryId);
  if (query.sizeId) url.searchParams.append("sizeId", query.sizeId);
  if (query.designId) url.searchParams.append("designId", query.designId);
  if (query.isFeatured !== undefined)
    url.searchParams.append("isFeatured", String(query.isFeatured));
  if (query.onlyNew !== undefined)
    url.searchParams.append("onlyNew", String(query.onlyNew));
  if (query.limit) url.searchParams.append("limit", String(query.limit));
  if (query.sortOption) url.searchParams.append("sortOption", query.sortOption);
  if (query.minPrice !== undefined && query.minPrice !== null)
    url.searchParams.append("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined && query.maxPrice !== null)
    url.searchParams.append("maxPrice", String(query.maxPrice));
  if (query.excludeProducts)
    url.searchParams.append("excludeProducts", query.excludeProducts);
  if (query.page) url.searchParams.append("page", String(query.page));
  if (query.itemsPerPage)
    url.searchParams.append("itemsPerPage", String(query.itemsPerPage));
  if (query.fromShop !== undefined)
    url.searchParams.append("fromShop", String(query.fromShop));
  if (query.search) url.searchParams.append("search", query.search);

  const response = await fetch(url);
  return response.json();
};
