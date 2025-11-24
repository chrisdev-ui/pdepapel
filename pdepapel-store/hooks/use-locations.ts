import { getDaneLocations } from "@/actions/get-dane-locations";
import { useQuery } from "@tanstack/react-query";

export function useLocations(q?: string, limit: number = 50) {
  const queryKey = ["locations", q, limit];

  const queryFn = async () => {
    return await getDaneLocations({ q, limit });
  };

  return useQuery({
    queryKey,
    queryFn,
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}
