import { useEffect, useRef } from "react";

import { sanitizeSearchTerm } from "@/lib/analytics-search-term";
import { trackCustomerEvent } from "@/lib/customer-analytics";

export const CITY_NOT_FOUND_MIN_LENGTH = 3;

/**
 * Una ciudad que la búsqueda no encontró, una vez por búsqueda y solo con la
 * respuesta de esa búsqueda (no la anterior que se sigue viendo mientras
 * carga): sirve para sumar alias.
 */
export function useCityNotFoundReport({
  query,
  results,
  isLoading,
  isStale,
}: {
  query: string;
  results: unknown[] | undefined;
  isLoading: boolean;
  isStale: boolean;
}) {
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    const term = query.trim();
    if (term.length < CITY_NOT_FOUND_MIN_LENGTH) return;
    if (isLoading || isStale || !results) return;
    if (results.length > 0 || reportedRef.current === term) return;
    reportedRef.current = term;
    trackCustomerEvent("city_not_found", {
      checkout_step: 2,
      search_term: sanitizeSearchTerm(term),
    });
  }, [query, results, isLoading, isStale]);
}
