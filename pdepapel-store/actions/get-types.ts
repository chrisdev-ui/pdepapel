import { env } from "@/lib/env.mjs";
import { Type } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/types`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getTypes = cache(async (): Promise<Type[]> => {
  try {
    const response = await fetch(API_URL, CATALOG_CACHE);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
});
