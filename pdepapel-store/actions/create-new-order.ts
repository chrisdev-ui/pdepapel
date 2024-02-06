import { env } from "@/lib/env.mjs";
import { CheckoutOrder, Order } from "@/types";
import axios, { AxiosResponse } from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

export const createNewOrder = async (
  formData: CheckoutOrder,
): Promise<Order> => {
  const response: AxiosResponse<Order> = await axios.post(API_URL, formData);

  return response.data;
};
