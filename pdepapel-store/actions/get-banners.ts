import { env } from "@/lib/env.mjs";
import { Banner } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/banners`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getBanners = async (): Promise<Banner[]> => {
  try {
    const response = await fetch(API_URL, CATALOG_CACHE);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};
