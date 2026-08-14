import { env } from "@/lib/env.mjs";
import { Billboard } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/billboards`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getBillboards = async (): Promise<Billboard[]> => {
  try {
    const response = await fetch(API_URL, CATALOG_CACHE);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};
