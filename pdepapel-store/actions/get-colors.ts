import { withUpstreamTimeout } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";
import { Color } from "@/types";
import { cache } from "react";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/colors`;
const CATALOG_CACHE = {
  next: { revalidate: 300, tags: ["catalog"] },
};

export const getColors = cache(async (): Promise<Color[]> => {
  try {
    const response = await fetch(API_URL, withUpstreamTimeout(CATALOG_CACHE));
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
});
