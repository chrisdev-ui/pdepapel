import { env } from "@/lib/env.mjs";
import { Order } from "@/types";
import qs from "query-string";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

interface Query {
  userId?: string;
}

export const getOrders = async (query: Query): Promise<Order[]> => {
  const url = qs.stringifyUrl({
    url: API_URL,
    query: {
      userId: query.userId,
    },
  });

  const response = await fetch(url);
  return response.json();
};
