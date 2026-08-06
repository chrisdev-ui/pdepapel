import { env } from "@/lib/env.mjs";
import { Product } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;
const CATALOG_CACHE = {
  next: { revalidate: 60, tags: ["products"] },
};

export const getProduct = cache(async (id: string): Promise<Product | null> => {
  try {
    const response = await fetch(
      `${API_URL}/${id}?include=kitComponents`,
      CATALOG_CACHE,
    );
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
});
