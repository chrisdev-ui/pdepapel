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

describe("wishlist cart actions and refresh", () => {
  it("adds to the cart without removing the favorite, and refuses sold-out products", async () => {
    const { useCart } = await import("@/hooks/use-cart");
    useCart.setState({ items: [] });
    const item = (id: string, stock: number) => ({ id, name: id, price: "1000", stock, images: [], reviews: [], addedOn: new Date("2026-09-01") }) as unknown as WishlistProduct;
    useWishlist.setState({ items: [item("a", 5), item("b", 0)], guestItems: [], accountUserId: null, isHydrated: true });

    expect(useWishlist.getState().addToCart("a")).toBe(true);
    expect(useCart.getState().items.map((cartItem) => cartItem.id)).toEqual(["a"]);
    expect(useWishlist.getState().items).toHaveLength(2);
    expect(useWishlist.getState().addToCart("b")).toBe(false);
    expect(useCart.getState().items).toHaveLength(1);
  });

  it("keeps the saved date when refreshing price and stock from the catalog", () => {
    const addedOn = new Date("2026-08-15T12:00:00Z");
    useWishlist.setState({ items: [{ id: "a", name: "A", price: "15000", stock: 3, images: [], reviews: [], addedOn } as unknown as WishlistProduct], guestItems: [], accountUserId: null, isHydrated: true });
    useWishlist.getState().refreshItems([{ id: "a", name: "A", price: "13000", stock: 1, images: [], reviews: [] } as never]);
    const refreshed = useWishlist.getState().items[0];
    expect(refreshed.price).toBe("13000");
    expect(refreshed.stock).toBe(1);
    expect(refreshed.addedOn).toEqual(addedOn);
    expect(useWishlist.getState().guestItems[0].price).toBe("13000");
  });
});
