"use server";

import { env } from "@/lib/env.mjs";
import { LocationOption } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/dane/search`;

interface Query {
  q?: string;
  limit?: number;
}

export const getDaneLocations = async (
  query: Query,
): Promise<{ results: LocationOption[]; count: number }> => {
  const url = new URL(API_URL);

  if (query.q) url.searchParams.append("q", query.q);
  if (query.limit) url.searchParams.append("limit", String(query.limit));

  try {
    const response = await fetch(url);
    if (!response.ok) return { results: [], count: 0 };
    return await response.json();
  } catch {
    return { results: [], count: 0 };
  }
};
