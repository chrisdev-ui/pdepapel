import { useQuery } from "@tanstack/react-query";

import {
  EMPTY_DANE_RESPONSE,
  type DaneLocationsResponse,
} from "@/actions/get-dane-locations";

export const LOCATIONS_ENDPOINT = "/api/locations";

/**
 * Buscador de ciudades del checkout. Va por una ruta normal para que cada
 * pulsación cancele la anterior en vez de hacer fila detrás de ella.
 */
async function fetchLocations(
  q: string | undefined,
  limit: number,
  signal?: AbortSignal,
): Promise<DaneLocationsResponse> {
  const params = new URLSearchParams();
  if (q) params.append("q", q);
  if (limit) params.append("limit", String(limit));

  const response = await fetch(`${LOCATIONS_ENDPOINT}?${params.toString()}`, {
    signal,
  });
  if (!response.ok) return EMPTY_DANE_RESPONSE;
  return await response.json();
}

export function useLocations(q?: string, limit: number = 50) {
  return useQuery({
    queryKey: ["locations", q, limit],
    queryFn: ({ signal }) => fetchLocations(q, limit, signal),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}
