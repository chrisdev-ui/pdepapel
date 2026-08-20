import { env } from "@/lib/env.mjs";
import axios from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/account/wishlist`;

type SyncMode = "merge" | "replace";

const authorizationHeaders = (sessionToken: string) => ({
  Authorization: `Bearer ${sessionToken}`,
});

export async function getAccountWishlist(sessionToken: string) {
  const response = await axios.get<{ productIds: string[] }>(API_URL, {
    headers: authorizationHeaders(sessionToken),
  });

  return response.data.productIds;
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
  const response = await axios.put<{ productIds: string[] }>(
    API_URL,
    { productIds, mode },
    { headers: authorizationHeaders(sessionToken) },
  );

  return response.data.productIds;
}
