import { env } from "@/lib/env.mjs";
import { CheckoutByOrderResponse, CheckoutOrder } from "@/types";
import axios, { AxiosResponse } from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/checkout`;

export const checkoutOrder = async (
  formData: CheckoutOrder,
): Promise<CheckoutByOrderResponse> => {
  const response: AxiosResponse<CheckoutByOrderResponse> = await axios.post(
    `${API_URL}`,
    formData,
  );

  return response.data;
};

export const checkoutByOrderId = async (
  orderId: string,
): Promise<CheckoutByOrderResponse> => {
  const response: AxiosResponse<CheckoutByOrderResponse> = await axios.post(
    `${API_URL}/${orderId}`,
  );

  return response.data;
};
