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
