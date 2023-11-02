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
  addItem: (item: Product) => void;
  removeItem: (id: string) => void;
  moveToCart: (id: string) => void;
  moveToCartMultiple: (ids: string[]) => void;
  clearWishlist: () => void;
}

export const useWishlist = create(
  persist<WishlistStore>(
    (set, get) => ({
      items: [],
      addItem: (item: Product) => {
        const currentItems = get().items;
        const existingItem = currentItems.find((i) => i.id === item.id);

        if (existingItem) {
          return toast({
            description: "Este producto ya está en tu lista de deseos.",
            icon: <ToastIcon icon="heart" />,
          });
        }
        const newItem: WishlistProduct = {
          ...item,
          addedOn: new Date(),
        };
        set({ items: [...currentItems, newItem] });
        toast({
          description: "Producto agregado a la lista de deseos.",
          variant: "success",
          icon: <ToastIcon icon="heart" variant="success" />,
        });
      },
      removeItem: (id: string) => {
        set({ items: [...get().items.filter((i) => i.id !== id)] });
        toast({
          description: "Producto eliminado de la lista de deseos.",
          icon: <ToastIcon icon="heart" />,
        });
      },
      moveToCart: (id: string) => {
        const { addItem: addToCart, items: cartItems } = useCart.getState();
        const { items, removeItem: removeFromWishlist } = get();

        const item = items.find((i) => i.id === id);

        if (item) {
          // Check if the item is already in the cart
          const isInCart = cartItems.some((cartItem) => cartItem.id === id);
          if (!isInCart) {
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
              icon: <ToastIcon icon="cart" />,
            });
          }
        }
      },
      moveToCartMultiple: (ids: string[]) => {
        ids.forEach((id) => {
          get().moveToCart(id);
        });
      },
      clearWishlist: () => set({ items: [] }),
    }),
    {
      name: "wishlist-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
