import { Product } from "@/types";
import qs from "query-string";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/products`;

interface Query {
  categoryId?: string;
  colorId?: string;
  sizeId?: string;
  designId?: string;
  isFeatured?: boolean;
  onlyNew?: boolean;
  limit?: number;
}

export const getProducts = async (query: Query): Promise<Product[]> => {
  const url = qs.stringifyUrl({
    url: API_URL,
    query: {
      colorId: query.colorId,
      categoryId: query.categoryId,
      sizeId: query.sizeId,
      designId: query.designId,
      isFeatured: query.isFeatured,
      onlyNew: query.onlyNew,
      limit: query.limit,
    },
  });

  const response = await fetch(url);
  return response.json();
};
