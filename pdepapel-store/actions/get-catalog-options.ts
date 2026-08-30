import { cache } from "react";

import { env } from "@/lib/env.mjs";
import { CatalogOption } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/catalog-options`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog", "catalog-options"] },
};

export const getCatalogOptions = cache(async (): Promise<CatalogOption[]> => {
  try {
    const response = await fetch(API_URL, CATALOG_CACHE);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
});
