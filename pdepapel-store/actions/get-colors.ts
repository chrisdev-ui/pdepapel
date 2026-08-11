import { env } from "@/lib/env.mjs";
import { Color } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/colors`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getColors = cache(async (): Promise<Color[]> => {
  try {
    const response = await fetch(API_URL, CATALOG_CACHE);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
});
