import { Product } from "@/types";
import qs from "query-string";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/products`;

interface Query {
  typeId?: string;
  categoryId?: string;
  colorId?: string;
  sizeId?: string;
  designId?: string;
  isFeatured?: boolean;
  onlyNew?: boolean;
  limit?: number;
  sortOption?: string;
  priceRange?: string;
}

export const getProducts = async (query: Query): Promise<Product[]> => {
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
    },
  });

  const response = await fetch(url);
  return response.json();
};
