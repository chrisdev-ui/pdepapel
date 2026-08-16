import { env } from "@/lib/env.mjs";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
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
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new UpstreamServiceError("el catálogo", response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof UpstreamServiceError) throw error;
    throw new UpstreamServiceError("el catálogo");
  }
});
