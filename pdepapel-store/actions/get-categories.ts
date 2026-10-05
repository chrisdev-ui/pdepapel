import { env } from "@/lib/env.mjs";
import { Category } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/categories`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getCategories = cache(async (): Promise<Category[]> => {
  try {
    const response = await fetch(API_URL, CATALOG_CACHE);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
});

/**
 * Para el sitemap: falla en vez de devolver una lista vacía, así Next sigue
 * sirviendo el último sitemap bueno en lugar de cachear uno sin categorías.
 */
export async function getCategoriesOrThrow(): Promise<Category[]> {
  const response = await fetch(API_URL, CATALOG_CACHE);
  if (!response.ok) {
    throw new Error(`No fue posible cargar categorías para el sitemap (${response.status})`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Respuesta de categorías inválida para el sitemap");
  return payload as Category[];
}
