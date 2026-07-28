"use server";

import { env } from "@/lib/env.mjs";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/products`;

interface StockCheckResponse {
  [productId: string]: {
    stock: number;
    name?: string;
  };
}

/**
 * Ultra-fast server action to check live, non-cached stock levels
 * for items in the user's cart right before checkout.
 */
export async function checkLiveStock(
  productIds: string[],
): Promise<StockCheckResponse> {
  if (!productIds || productIds.length === 0) {
    return {};
  }

  try {
    const url = new URL(API_URL);
    url.searchParams.append("ids", productIds.join(","));
    url.searchParams.append("skipCache", "true");
    url.searchParams.append("_t", String(Date.now())); // Cache-buster

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) return {};

    const data = await response.json();
    const productsList = Array.isArray(data)
      ? data
      : data.products || [];

    const result: StockCheckResponse = {};
    for (const item of productsList) {
      if (item && item.id) {
        result[item.id] = {
          stock: typeof item.stock === "number" ? item.stock : 0,
          name: item.name,
        };
      }
    }

    return result;
  } catch (error) {
    console.error("Error checking live stock:", error);
    return {};
  }
}
