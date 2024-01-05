import { env } from "@/lib/env.mjs";
import { ProductsResponse } from "@/types";
import qs from "query-string";

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
  priceRange?: string;
  excludeProducts?: string;
}

export const getProducts = async (query: Query): Promise<ProductsResponse> => {
  const url = qs.stringifyUrl({
    url: API_URL,
    query: {
      colorId: query.colorId,
      typeId: query.typeId,
      categoryId: query.categoryId,
      sizeId: query.sizeId,
      designId: query.designId,
      isFeatured: query.isFeatured,
      onlyNew: query.onlyNew,
      limit: query.limit,
      sortOption: query.sortOption,
      priceRange: query.priceRange,
      excludeProducts: query.excludeProducts,
      page: query.page,
      itemsPerPage: query.itemsPerPage,
      fromShop: query.fromShop,
    },
  });

  const response = await fetch(url);
  return response.json();
};
