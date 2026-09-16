import { env } from "@/lib/env.mjs";
import { LocationOption } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/dane/search`;

export interface DaneLocationsQuery {
  q?: string;
  limit?: number;
}

export interface DaneLocationsResponse {
  results: LocationOption[];
  count: number;
}

export const EMPTY_DANE_RESPONSE: DaneLocationsResponse = {
  results: [],
  count: 0,
};

/**
 * Ya no es una server action: el buscador de ciudades del checkout pasa por
 * `/api/locations`, que se puede cancelar y no hace fila detrás de otra.
 */
export const getDaneLocations = async (
  query: DaneLocationsQuery,
): Promise<DaneLocationsResponse> => {
  const url = new URL(API_URL);

  if (query.q) url.searchParams.append("q", query.q);
  if (query.limit) url.searchParams.append("limit", String(query.limit));

  try {
    const response = await fetch(url);
    if (!response.ok) return EMPTY_DANE_RESPONSE;
    return await response.json();
  } catch {
    return EMPTY_DANE_RESPONSE;
  }
};
