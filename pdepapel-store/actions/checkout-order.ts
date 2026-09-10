import { env } from "@/lib/env.mjs";
import { CheckoutByOrderResponse, CheckoutOrder, CheckoutResponse } from "@/types";
import axios, { AxiosResponse } from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/checkout`;

/** Creating an order is one round trip; past this the customer must be told. */
export const CHECKOUT_REQUEST_TIMEOUT_MS = 20_000;

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function buildOrderRequestHeaders(
  sessionToken?: string | null,
  idempotencyKey?: string | null,
): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  if (idempotencyKey) headers[IDEMPOTENCY_HEADER] = idempotencyKey;
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export const checkoutOrder = async (
  formData: CheckoutOrder,
  sessionToken?: string | null,
  idempotencyKey?: string | null,
): Promise<CheckoutResponse> => {
  const response: AxiosResponse<CheckoutResponse> = await axios.post(
    `${API_URL}`,
    formData,
    {
      headers: buildOrderRequestHeaders(sessionToken, idempotencyKey),
      timeout: CHECKOUT_REQUEST_TIMEOUT_MS,
    },
  );

  return response.data;
};

/** Payment link for an existing unpaid online order (fallback gateway). */
export const checkoutByOrderId = async (
  orderId: string,
): Promise<CheckoutByOrderResponse> => {
  const response: AxiosResponse<CheckoutByOrderResponse> = await axios.post(
    `${API_URL}/${orderId}`,
    undefined,
    { timeout: CHECKOUT_REQUEST_TIMEOUT_MS },
  );

  return response.data;
};
