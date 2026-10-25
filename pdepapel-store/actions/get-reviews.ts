import { cache } from "react";

import { withUpstreamTimeout } from "@/lib/catalog-cache";
import { publicEnv as env } from "@/lib/public-env";
import { HomeReviewsResponse } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/reviews`;
const EMPTY: HomeReviewsResponse = { reviews: [], summary: { average: null, count: 0 } };

export const REVIEWS_CACHE = {
  next: { revalidate: 300, tags: ["reviews"] },
};

export const getReviews = cache(async (limit = 9): Promise<HomeReviewsResponse> => {
  try {
    const response = await fetch(`${API_URL}?limit=${limit}`, withUpstreamTimeout(REVIEWS_CACHE));
    if (!response.ok) return EMPTY;
    const data = (await response.json()) as Partial<HomeReviewsResponse>;
    return {
      reviews: Array.isArray(data.reviews) ? data.reviews : [],
      summary: data.summary ?? EMPTY.summary,
    };
  } catch {
    return EMPTY;
  }
});
