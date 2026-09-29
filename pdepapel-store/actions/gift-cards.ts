import axios from "axios";

import { buildOrderRequestHeaders, CHECKOUT_REQUEST_TIMEOUT_MS } from "@/actions/checkout-order";
import { env } from "@/lib/env.mjs";
import type { CheckoutResponse, GiftCardPurchase } from "@/types";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/gift-cards`;

/** Los valores a la venta. La administración decide cuáles; vacío nunca: hay tres por defecto. */
export async function getGiftCardDenominations(): Promise<number[]> {
  try {
    const response = await fetch(`${API_URL}/denominations`, {
      next: { revalidate: 300, tags: ["storefront-settings"] },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { denominations?: unknown };
    return Array.isArray(data.denominations)
      ? data.denominations.filter((value): value is number => typeof value === "number" && value > 0)
      : [];
  } catch {
    return [];
  }
}

/**
 * Compra una tarjeta de regalo. Responde como el checkout: `{ url }` para
 * Wompi, `{ order, boldData }` para Bold y el pedido para transferencia.
 */
export async function checkoutGiftCard(
  data: GiftCardPurchase,
  sessionToken?: string | null,
  idempotencyKey?: string,
): Promise<CheckoutResponse> {
  const response = await axios.post<CheckoutResponse>(`${API_URL}/checkout`, data, {
    headers: buildOrderRequestHeaders(sessionToken, idempotencyKey),
    timeout: CHECKOUT_REQUEST_TIMEOUT_MS,
  });
  return response.data;
}
