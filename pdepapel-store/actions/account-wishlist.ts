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
  /** Guardado como familia (grupo); falta en filas anteriores al cambio. */
  savedAsGroup?: boolean;
  createdAt: string;
}

/** Lo que se manda al sincronizar: el id y si se guardó como familia. */
export interface AccountWishlistEntry {
  productId: string;
  savedAsGroup?: boolean;
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
  entries,
  mode,
}: {
  sessionToken: string;
  entries: AccountWishlistEntry[];
  mode: SyncMode;
}) {
  // `productIds` acompaña a `items` por si el servidor aún no entiende el
  // segundo: así la sincronización nunca se queda sin favoritos.
  const response = await axios.put<AccountWishlistResponse>(
    API_URL,
    {
      productIds: entries.map((entry) => entry.productId),
      items: entries.map((entry) => ({
        productId: entry.productId,
        savedAsGroup: Boolean(entry.savedAsGroup),
      })),
      mode,
    },
    { headers: authorizationHeaders(sessionToken) },
  );

  return toItems(response.data);
}
