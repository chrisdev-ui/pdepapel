import { cache } from "react";

import { env } from "@/lib/env.mjs";
import { LiveHomeContent } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/home-content?live=1`;
const EMPTY: LiveHomeContent = { hero: null, campaign: null };

export const HOME_CONTENT_CACHE = {
  next: { revalidate: 300, tags: ["home-content"] },
};

export const getHomeContent = cache(async (): Promise<LiveHomeContent> => {
  try {
    const response = await fetch(API_URL, HOME_CONTENT_CACHE);
    if (!response.ok) return EMPTY;
    const data = (await response.json()) as Partial<LiveHomeContent>;
    return { hero: data.hero ?? null, campaign: data.campaign ?? null };
  } catch {
    return EMPTY;
  }
});
