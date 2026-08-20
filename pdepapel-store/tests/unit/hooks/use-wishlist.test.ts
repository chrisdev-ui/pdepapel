import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { WishlistProduct } from "@/hooks/use-wishlist";

const storage = new Map<string, string>();

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  configurable: true,
});

let useWishlist: typeof import("@/hooks/use-wishlist").useWishlist;

const product = (id: string) => ({ id, name: `Producto ${id}` }) as WishlistProduct;

describe("wishlist account isolation", () => {
  beforeAll(async () => {
    ({ useWishlist } = await import("@/hooks/use-wishlist"));
  });

  beforeEach(() => {
    storage.clear();
    useWishlist.setState({
      items: [product("guest-product")],
      guestItems: [product("guest-product")],
      accountUserId: null,
      isHydrated: true,
    });
  });

  it("does not persist an account list over the local guest list", () => {
    useWishlist.getState().setAccountItems([product("account-product")], "user-1");

    expect(useWishlist.getState().items.map((item) => item.id)).toEqual([
      "account-product",
    ]);
    expect(useWishlist.getState().guestItems.map((item) => item.id)).toEqual([
      "guest-product",
    ]);

    useWishlist.getState().activateGuestWishlist();

    expect(useWishlist.getState().accountUserId).toBeNull();
    expect(useWishlist.getState().items.map((item) => item.id)).toEqual([
      "guest-product",
    ]);
  });

  it("clears only the signed-in account view without erasing guest favorites", () => {
    useWishlist.getState().setAccountItems([product("account-product")], "user-1");
    useWishlist.getState().clearWishlist();

    expect(useWishlist.getState().items).toEqual([]);
    expect(useWishlist.getState().guestItems.map((item) => item.id)).toEqual([
      "guest-product",
    ]);
  });
});
