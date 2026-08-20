"use client";

import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { useEffect, useRef } from "react";

import {
  getAccountWishlist,
  syncAccountWishlist,
} from "@/actions/account-wishlist";
import { env } from "@/lib/env.mjs";
import { useWishlist, WishlistProduct } from "@/hooks/use-wishlist";
import { Product } from "@/types";

const getItemsKey = (productIds: string[]) => [...productIds].sort().join(",");

async function getProducts(productIds: string[]): Promise<WishlistProduct[]> {
  if (productIds.length === 0) return [];

  const response = await axios.get<Product[]>(
    `${env.NEXT_PUBLIC_API_URL}/products`,
    { params: { ids: productIds.join(",") } },
  );
  const productsById = new Map(response.data.map((product) => [product.id, product]));

  return productIds.flatMap((productId) => {
    const product = productsById.get(productId);
    return product ? [{ ...product, addedOn: new Date() }] : [];
  });
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

        const remoteProductIds = await getAccountWishlist(sessionToken);
        const guestProductIds = guestItems.map((item) => item.id);
        const productIds = guestProductIds.length
          ? await syncAccountWishlist({
              sessionToken,
              productIds: guestProductIds,
              mode: "merge",
            })
          : remoteProductIds;
        const accountItems = await getProducts(productIds);

        if (!isCurrent) return;
        setAccountItems(accountItems, userId);
        lastSyncedKey.current = `${userId}:${getItemsKey(productIds)}`;
      } catch (error) {
        console.warn("No se pudieron sincronizar los favoritos de la cuenta", error);
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

        const syncedProductIds = await syncAccountWishlist({
          sessionToken,
          productIds,
          mode: "replace",
        });
        lastSyncedKey.current = `${userId}:${getItemsKey(syncedProductIds)}`;

        if (getItemsKey(syncedProductIds) !== getItemsKey(productIds)) {
          const accountItems = await getProducts(syncedProductIds);
          setAccountItems(accountItems, userId);
        }
      } catch (error) {
        console.warn("No se pudieron guardar los favoritos de la cuenta", error);
      }
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [accountUserId, getToken, isHydrated, isLoaded, items, setAccountItems, userId]);

  return null;
}
