"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useRef } from "react";

import {
  AccountWishlistItem,
  getAccountWishlist,
  syncAccountWishlist,
} from "@/actions/account-wishlist";
import { env } from "@/lib/env.mjs";
import { useWishlist, WishlistProduct } from "@/hooks/use-wishlist";
import { Product } from "@/types";

const getItemsKey = (productIds: string[]) => [...productIds].sort().join(",");

/**
 * Une los ids de la cuenta con los productos del catálogo: fecha y precio de
 * guardado vienen del servidor; si faltan, se conserva lo que ya se conocía.
 */
export function mergeAccountProducts(
  remote: AccountWishlistItem[],
  products: Product[],
  known: Pick<WishlistProduct, "id" | "addedOn">[],
): WishlistProduct[] {
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const addedOnById = new Map(known.map((item) => [item.id, item.addedOn]));
  return remote.flatMap((entry) => {
    const product = productsById.get(entry.productId);
    if (!product) return [];
    const serverDate = entry.createdAt ? new Date(entry.createdAt) : null;
    const addedOn =
      serverDate && !Number.isNaN(serverDate.getTime())
        ? serverDate
        : (addedOnById.get(entry.productId) ?? new Date());
    return [{ ...product, addedOn, savedPrice: entry.savedPrice ?? null }];
  });
}

async function getProducts(
  remote: AccountWishlistItem[],
  known: Pick<WishlistProduct, "id" | "addedOn">[],
): Promise<WishlistProduct[]> {
  if (remote.length === 0) return [];

  const response = await axios.get<Product[]>(
    `${env.NEXT_PUBLIC_API_URL}/products`,
    { params: { ids: remote.map((entry) => entry.productId).join(",") } },
  );
  return mergeAccountProducts(remote, response.data, known);
}

export function WishlistSyncProvider() {
  const { getToken, isLoaded, userId } = useAuth();
  const items = useWishlist((state) => state.items);
  const guestItems = useWishlist((state) => state.guestItems);
  const accountUserId = useWishlist((state) => state.accountUserId);
  const isHydrated = useWishlist((state) => state.isHydrated);
  const setAccountItems = useWishlist((state) => state.setAccountItems);
  const activateGuestWishlist = useWishlist(
    (state) => state.activateGuestWishlist,
  );
  const lastSyncedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isHydrated) return;

    if (!userId) {
      lastSyncedKey.current = null;
      activateGuestWishlist();
      return;
    }

    let isCurrent = true;

    const loadAccountWishlist = async () => {
      try {
        const sessionToken = await getToken();
        if (!sessionToken) return;

        const remoteItems = await getAccountWishlist(sessionToken);
        const guestProductIds = guestItems.map((item) => item.id);
        const remote = guestProductIds.length
          ? await syncAccountWishlist({
              sessionToken,
              productIds: guestProductIds,
              mode: "merge",
            })
          : remoteItems;
        const accountItems = await getProducts(remote, [
          ...useWishlist.getState().items,
          ...guestItems,
        ]);

        if (!isCurrent) return;
        setAccountItems(accountItems, userId);
        lastSyncedKey.current = `${userId}:${getItemsKey(remote.map((entry) => entry.productId))}`;
      } catch (error) {
        console.warn(
          "No se pudieron sincronizar los favoritos de la cuenta",
          error,
        );
        if (isCurrent) activateGuestWishlist();
      }
    };

    void loadAccountWishlist();

    return () => {
      isCurrent = false;
    };
  }, [
    activateGuestWishlist,
    getToken,
    guestItems,
    isHydrated,
    isLoaded,
    setAccountItems,
    userId,
  ]);

  useEffect(() => {
    if (!isLoaded || !isHydrated || !userId || accountUserId !== userId) return;

    const productIds = items.map((item) => item.id);
    const currentKey = `${userId}:${getItemsKey(productIds)}`;
    if (lastSyncedKey.current === currentKey) return;

    const timeout = window.setTimeout(async () => {
      try {
        const sessionToken = await getToken();
        if (!sessionToken) return;

        const synced = await syncAccountWishlist({
          sessionToken,
          productIds,
          mode: "replace",
        });
        const syncedProductIds = synced.map((entry) => entry.productId);
        lastSyncedKey.current = `${userId}:${getItemsKey(syncedProductIds)}`;

        if (getItemsKey(syncedProductIds) !== getItemsKey(productIds)) {
          const accountItems = await getProducts(
            synced,
            useWishlist.getState().items,
          );
          setAccountItems(accountItems, userId);
        }
      } catch (error) {
        console.warn(
          "No se pudieron guardar los favoritos de la cuenta",
          error,
        );
      }
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [
    accountUserId,
    getToken,
    isHydrated,
    isLoaded,
    items,
    setAccountItems,
    userId,
  ]);

  return null;
}
