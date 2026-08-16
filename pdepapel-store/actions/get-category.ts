import { env } from "@/lib/env.mjs";
import { UpstreamServiceError } from "@/lib/upstream-service-error";
import { Category } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/categories`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getCategory = cache(async (
  id: string,
): Promise<Category | null> => {
  try {
    const response = await fetch(`${API_URL}/${id}`, CATALOG_CACHE);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new UpstreamServiceError("las categorías", response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof UpstreamServiceError) throw error;
    throw new UpstreamServiceError("las categorías");
  }
});
