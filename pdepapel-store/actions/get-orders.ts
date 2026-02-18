"use server";

import { env } from "@/lib/env.mjs";
import { Order } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/orders`;

interface Query {
  userId?: string;
}

export const getOrders = async (query: Query): Promise<Order[]> => {
  const url = new URL(API_URL);

  if (query.userId) url.searchParams.append("userId", query.userId);

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};
