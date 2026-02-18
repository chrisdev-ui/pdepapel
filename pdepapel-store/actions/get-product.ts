import { env } from "@/lib/env.mjs";
import { Product } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;

export const getProduct = async (id: string): Promise<Product | null> => {
  try {
    const response = await fetch(`${API_URL}/${id}?include=kitComponents`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};
