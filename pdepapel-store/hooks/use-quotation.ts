import { normalizeOrder } from "@/lib/normalization";
import { UnifiedOrder } from "@/types/unified-order";
import { useCallback, useEffect, useState } from "react";

const URL = `${process.env.NEXT_PUBLIC_API_URL}/public/custom-orders`;

interface UseQuotationResult {
  data: UnifiedOrder | null;
  isLoading: boolean;
  isError: boolean;
  error?: any;
  markAsViewed: () => Promise<void>;
  acceptQuote: () => Promise<UnifiedOrder>;
  requestChange: (message: string) => Promise<any>;
  refresh: () => Promise<void>;
}

// function removed, imported from "@/lib/normalization"

export const useQuotation = (token?: string | null): UseQuotationResult => {
  const [data, setData] = useState<UnifiedOrder | null>(null);
  const [isLoading, setIsLoading] = useState(!!token);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<any>(null);

  const fetchQuotation = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setIsError(false);
    setError(null);

    try {
      // Use timestamp for cache busting to avoid potential CORS preflight issues
      // with custom Cache-Control headers on some server configurations
      const timestamp = new Date().getTime();
      const response = await fetch(`${URL}/${token}?t=${timestamp}`);

      if (!response.ok) {
        throw new Error("Failed to fetch quotation");
      }

      const jsonData = await response.json();
      const normalizedData = normalizeOrder(jsonData);
      console.log("Normalized Quotation Data:", normalizedData);
      setData(normalizedData);
    } catch (err) {
      console.error("Error fetching quotation:", err);
      setIsError(true);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchQuotation();
  }, [fetchQuotation]);

  const refresh = async () => {
    await fetchQuotation();
  };

  const markAsViewed = async () => {
    if (!token) return;
    try {
      await fetch(`${URL}/${token}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error marking quotation as viewed:", error);
    }
  };

  const acceptQuote = async () => {
    if (!token) throw new Error("No token provided");
    const res = await fetch(`${URL}/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("Failed to accept quotation");

    const updatedOrderValue = await res.json();

    // Normalize and FORCE the status to ACCEPTED to ensure UI updates
    // This handles cases where backend might return stale state or asynchronous updates
    const normalized = normalizeOrder(updatedOrderValue);
    normalized.status = "ACCEPTED";

    setData(normalized);

    return normalized;
  };

  const requestChange = async (message: string) => {
    if (!token) throw new Error("No token provided");
    const res = await fetch(`${URL}/${token}/request-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error("Failed to send change request");

    // For change request, we likely want to refresh fully to get new status
    await refresh();
    return res.json();
  };

  return {
    data,
    isLoading,
    isError,
    error,
    refresh,
    markAsViewed,
    acceptQuote,
    requestChange,
  };
};
