import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ToastIcon } from "@/components/ui/toast-icon";
import { useCart } from "@/hooks/use-cart";
import { toast } from "@/hooks/use-toast";
import { Product } from "@/types";

export interface WishlistProduct extends Product {
  addedOn: Date;
}

interface WishlistStore {
  items: WishlistProduct[];
  guestItems: WishlistProduct[];
  accountUserId: string | null;
  isHydrated: boolean;
  addItem: (item: Product) => void;
  removeItem: (id: string) => void;
  moveToCart: (id: string) => void;
  moveToCartMultiple: (ids: string[]) => void;
  clearWishlist: () => void;
  setAccountItems: (items: WishlistProduct[], userId: string) => void;
  activateGuestWishlist: () => void;
  setHydrated: () => void;
}

export const useWishlist = create(
  persist<WishlistStore>(
    (set, get) => ({
      items: [],
      guestItems: [],
      accountUserId: null,
      isHydrated: false,
      addItem: (item: Product) => {
        const currentItems = get().items;
        const existingItem = currentItems.find((i) => i.id === item.id);

        if (existingItem) {
          return toast({
            description: "Este producto ya está en tu lista de deseos.",
            variant: "info",
            icon: <ToastIcon icon="heart" variant="info" />,
          });
        }
        const newItem: WishlistProduct = {
          ...item,
          addedOn: new Date(),
        };
        const items = [...currentItems, newItem];
        set(
          get().accountUserId
            ? { items }
            : { items, guestItems: items },
        );
        toast({
          description: "Producto agregado a la lista de deseos.",
          variant: "success",
          icon: <ToastIcon icon="heart" variant="success" />,
        });
      },
      removeItem: (id: string) => {
        const items = get().items.filter((item) => item.id !== id);
        set(
          get().accountUserId
            ? { items }
            : { items, guestItems: items },
        );
        toast({
          description: "Producto eliminado de la lista de deseos.",
          variant: "info",
          icon: <ToastIcon icon="heart" variant="info" />,
        });
      },
      moveToCart: (id: string) => {
        const { addItem: addToCart, items: cartItems } = useCart.getState();
        const { items, removeItem: removeFromWishlist } = get();

        const item = items.find((i) => i.id === id);

        if (item) {
          const isInCart = cartItems.some((cartItem) => cartItem.id === id);
          if (!isInCart && item.stock > 0) {
            addToCart(item);
            removeFromWishlist(id);
            toast({
              description: "Producto movido al carrito.",
              variant: "success",
              icon: <ToastIcon icon="cart" variant="success" />,
            });
          } else {
            toast({
              description: "Este producto ya está en tu carrito.",
              variant: "info",
              icon: <ToastIcon icon="cart" variant="info" />,
            });
          }
        }
      },
      moveToCartMultiple: (ids: string[]) => {
        ids.forEach((id) => {
          get().moveToCart(id);
        });
      },
      clearWishlist: () =>
        set(get().accountUserId ? { items: [] } : { items: [], guestItems: [] }),
      setAccountItems: (items, userId) =>
        set({ items, accountUserId: userId }),
      activateGuestWishlist: () =>
        set({ items: get().guestItems, accountUserId: null }),
      setHydrated: () =>
        set({ items: get().guestItems, accountUserId: null, isHydrated: true }),
    }),
    {
      name: "wishlist-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) =>
        ({ guestItems: state.guestItems }) as unknown as WishlistStore,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
