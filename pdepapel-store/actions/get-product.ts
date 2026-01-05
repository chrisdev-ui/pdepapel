import { env } from "@/lib/env.mjs";
import { Product } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;

export const getProduct = async (id: string): Promise<Product | null> => {
  const response = await fetch(`${API_URL}/${id}`, { cache: "no-store" });
  return response.json();
};
