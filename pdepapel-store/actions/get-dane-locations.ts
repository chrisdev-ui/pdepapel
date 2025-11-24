import { env } from "@/lib/env.mjs";
import { LocationOption } from "@/types";
import qs from "query-string";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/dane/search`;

interface Query {
  q?: string;
  limit?: number;
}

export const getDaneLocations = async (
  query: Query,
): Promise<{ results: LocationOption[]; count: number }> => {
  const url = qs.stringifyUrl({
    url: API_URL,
    query: {
      q: query.q,
      limit: query.limit,
    },
  });

  const response = await fetch(url);
  return response.json();
};
