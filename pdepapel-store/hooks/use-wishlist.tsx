import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ToastIcon } from "@/components/ui/toast-icon";
import { useCart } from "@/hooks/use-cart";
import { toast } from "@/hooks/use-toast";
import { slimStoredProduct } from "@/lib/stored-product";
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
  /** Al carrito y fuera de favoritos (guardados para después). */
  moveToCart: (id: string) => void;
  moveToCartMultiple: (ids: string[]) => void;
  /** Al carrito sin quitarlo de favoritos. Devuelve si se agregó. */
  addToCart: (id: string) => boolean;
  /** Refresca precio y stock desde el catálogo conservando la fecha de guardado. */
  refreshItems: (products: Product[]) => void;
  /** Agrega los que falten sin avisos; devuelve cuántos entraron. */
  addMany: (products: Product[]) => number;
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

        if (!item) return;
        if (item.stock <= 0) {
          return toast({
            description: "Este producto está agotado por ahora; te avisamos cuando vuelva desde su página.",
            variant: "warning",
            icon: <ToastIcon icon="cart" variant="info" />,
          });
        }
        const isInCart = cartItems.some((cartItem) => cartItem.id === id);
        if (isInCart) {
          return toast({
            description: "Este producto ya está en tu carrito.",
            variant: "info",
            icon: <ToastIcon icon="cart" variant="info" />,
          });
        }
        const result = addToCart(item);
        if (!result.ok) {
          return toast({ description: "Este producto no está disponible en este momento.", variant: "warning" });
        }
        removeFromWishlist(id);
        toast({
          description: "Producto movido al carrito.",
          variant: "success",
          icon: <ToastIcon icon="cart" variant="success" />,
        });
      },
      addToCart: (id: string) => {
        const { addItem: addToCart, items: cartItems } = useCart.getState();
        const item = get().items.find((i) => i.id === id);
        if (!item) return false;
        if (item.stock <= 0) {
          toast({ description: "Este producto está agotado por ahora.", variant: "warning" });
          return false;
        }
        if (cartItems.some((cartItem) => cartItem.id === id)) {
          toast({ description: "Este producto ya está en tu carrito.", variant: "info", icon: <ToastIcon icon="cart" variant="info" /> });
          return false;
        }
        const result = addToCart(item);
        if (!result.ok) {
          toast({ description: "Este producto no está disponible en este momento.", variant: "warning" });
          return false;
        }
        toast({ description: "Producto agregado al carrito.", variant: "success", icon: <ToastIcon icon="cart" variant="success" /> });
        return true;
      },
      addMany: (products: Product[]) => {
        const current = get().items;
        const known = new Set(current.map((item) => item.id));
        const fresh = products.filter((product) => !known.has(product.id)).map((product) => ({ ...product, addedOn: new Date() }));
        if (fresh.length === 0) return 0;
        const items = [...current, ...fresh];
        set(get().accountUserId ? { items } : { items, guestItems: items });
        return fresh.length;
      },
      refreshItems: (products: Product[]) => {
        const fresh = new Map(products.map((product) => [product.id, product]));
        const items = get().items.map((item) => {
          const product = fresh.get(item.id);
          return product ? { ...item, ...product, addedOn: item.addedOn } : item;
        });
        set(get().accountUserId ? { items } : { items, guestItems: items });
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
      version: 1,
      partialize: (state) =>
        ({ guestItems: state.guestItems.map((item) => ({ ...slimStoredProduct(item), addedOn: item.addedOn })) }) as unknown as WishlistStore,
      migrate: (persisted, version) => {
        const state = persisted as Partial<WishlistStore>;
        if (version < 1 && Array.isArray(state.guestItems)) {
          return { ...state, guestItems: state.guestItems.map((item) => ({ ...slimStoredProduct(item), addedOn: item.addedOn })) } as WishlistStore;
        }
        return state as WishlistStore;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
