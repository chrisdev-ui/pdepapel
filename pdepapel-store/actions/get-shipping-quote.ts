import { env } from "@/lib/env.mjs";
import { ShippingQuoteRequest, ShippingQuoteResponse } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/shipment/quote`;

/** Carrier quotes come from EnvioClick through the admin; past this we ask the customer to retry. */
export const SHIPPING_QUOTE_TIMEOUT_MS = 20_000;

export const SHIPPING_QUOTE_ERROR_MESSAGE =
  "No pudimos calcular el envío. Suele ser un problema momentáneo de conexión.";

export const getShippingQuote = async (
  request: ShippingQuoteRequest,
): Promise<ShippingQuoteResponse> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHIPPING_QUOTE_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        typeof error?.message === "string" && error.message
          ? error.message
          : SHIPPING_QUOTE_ERROR_MESSAGE,
      );
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(SHIPPING_QUOTE_ERROR_MESSAGE);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
