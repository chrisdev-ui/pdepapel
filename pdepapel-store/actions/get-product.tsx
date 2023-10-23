import { Product } from "@/types";

const API_URL = `${process.env.NEXT_PUBLIC_API_URL}/products`;

export const getProduct = async (id: string): Promise<Product> => {
  const response = await fetch(`${API_URL}/${id}`);
  return response.json();
};
