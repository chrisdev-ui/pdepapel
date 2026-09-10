import {
  buildOrderRequestHeaders,
  CHECKOUT_REQUEST_TIMEOUT_MS,
} from "@/actions/checkout-order";
import { env } from "@/lib/env.mjs";
import { CheckoutOrder, Order } from "@/types";
import axios, { AxiosResponse } from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

export const createNewOrder = async (
  formData: CheckoutOrder,
  sessionToken?: string | null,
  idempotencyKey?: string | null,
): Promise<Order> => {
  const response: AxiosResponse<Order> = await axios.post(API_URL, formData, {
    headers: buildOrderRequestHeaders(sessionToken, idempotencyKey),
    timeout: CHECKOUT_REQUEST_TIMEOUT_MS,
  });

  return response.data;
};
