import { env } from "@/lib/env.mjs";
import axios from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/account/wishlist`;

type SyncMode = "merge" | "replace";

const authorizationHeaders = (sessionToken: string) => ({
  Authorization: `Bearer ${sessionToken}`,
});

export interface AccountWishlistItem {
  productId: string;
  /** Precio efectivo visto al guardar; null en filas anteriores al cambio. */
  savedPrice: number | null;
  createdAt: string;
}

interface AccountWishlistResponse {
  productIds: string[];
  items?: AccountWishlistItem[];
}

const toItems = (data: AccountWishlistResponse): AccountWishlistItem[] =>
  data.items ??
  data.productIds.map((productId) => ({
    productId,
    savedPrice: null,
    createdAt: new Date().toISOString(),
  }));

export async function getAccountWishlist(
  sessionToken: string,
): Promise<AccountWishlistItem[]> {
  const response = await axios.get<AccountWishlistResponse>(API_URL, {
    headers: authorizationHeaders(sessionToken),
  });

  return toItems(response.data);
}

export async function syncAccountWishlist({
  sessionToken,
  productIds,
  mode,
}: {
  sessionToken: string;
  productIds: string[];
  mode: SyncMode;
}) {
  const response = await axios.put<AccountWishlistResponse>(
    API_URL,
    { productIds, mode },
    { headers: authorizationHeaders(sessionToken) },
  );

  return toItems(response.data);
}
