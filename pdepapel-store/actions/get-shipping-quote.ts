import { env } from "@/lib/env.mjs";
import { ShippingQuoteRequest, ShippingQuoteResponse } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/shipment/quote`;

export const getShippingQuote = async (
  request: ShippingQuoteRequest,
): Promise<ShippingQuoteResponse> => {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch shipping quotes");
  }

  return response.json();
};
