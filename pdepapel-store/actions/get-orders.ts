import { env } from "@/lib/env.mjs";
import { Order } from "@/types";
import axios from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

export const getOrders = async (sessionToken: string): Promise<Order[]> => {
  const response = await axios.get<Order[]>(API_URL, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  return response.data;
};
