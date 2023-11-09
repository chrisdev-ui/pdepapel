import { env } from "@/lib/env.mjs";
import { Order } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

export const getOrder = async (id: string): Promise<Order> => {
  const response = await fetch(`${API_URL}/${id}`);
  return response.json();
};
