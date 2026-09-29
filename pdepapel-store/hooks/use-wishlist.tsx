import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ToastIcon } from "@/components/ui/toast-icon";
import { useCart } from "@/hooks/use-cart";
import { toast } from "@/hooks/use-toast";
import { slimStoredProduct } from "@/lib/stored-product";
import { getPurchasableUnits, isPresaleItem } from "@/lib/purchasable-units";
import { Product } from "@/types";

export interface WishlistProduct extends Product {
  addedOn: Date;
  /** Precio que vio la clienta al guardar (cuenta); para avisar si bajó. */
  savedPrice?: number | null;
  /**
   * Guardado como familia (grupo de variantes) desde la tarjeta o la ficha
   * del grupo. `id` es la variante que le ponía cara al grupo ese día; al
   * refrescar, la familia se busca por `productGroupId` y se muestra como
   * grupo con «Elegir opción», no como esa variante.
   */
  savedAsGroup?: boolean;
}

/**
 * Refresca cada favorito con lo que hay hoy en el catálogo. Un favorito
 * guardado como familia toma la familia por su grupo (nombre del grupo,
 * rango, opciones, stock sumado) y conserva su `id` y su `slug`: son la
 * llave del favorito y de la fila de la cuenta. Sin familia (grupo borrado)
 * se queda con la variante, y sin nada fresco se queda como estaba.
 */
export function refreshWishlistItems(
  items: WishlistProduct[],
  products: Product[],
  families: Product[] = [],
): WishlistProduct[] {
  const fresh = new Map(products.map((product) => [product.id, product]));
  const byGroup = new Map(
    families
      .filter((family) => family.productGroupId)
      .map((family) => [family.productGroupId as string, family]),
  );
  return items.map((item) => {
    const family =
      item.savedAsGroup && item.productGroupId
        ? byGroup.get(item.productGroupId)
        : undefined;
    if (family) {
      return {
        ...item,
        ...family,
        id: item.id,
        slug: item.slug ?? family.slug,
        addedOn: item.addedOn,
        savedPrice: item.savedPrice,
        savedAsGroup: true,
      };
    }
    const product = fresh.get(item.id);
    return product
      ? {
          ...item,
          ...product,
          addedOn: item.addedOn,
          savedPrice: item.savedPrice,
          savedAsGroup: item.savedAsGroup,
        }
      : item;
  });
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
  /** Refresca precio y stock desde el catálogo conservando la fecha de guardado; las familias llegan aparte. */
  refreshItems: (products: Product[], families?: Product[]) => void;
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
          // Un grupo se guarda como familia; la variante que lo representa
          // hoy puede cambiar mañana y no debe convertirse en el favorito.
          savedAsGroup: Boolean(item.isGroup),
        };
        const items = [...currentItems, newItem];
        set(get().accountUserId ? { items } : { items, guestItems: items });
        toast({
          description: "Producto agregado a la lista de deseos.",
          variant: "success",
          icon: <ToastIcon icon="heart" variant="success" />,
        });
      },
      removeItem: (id: string) => {
        const items = get().items.filter((item) => item.id !== id);
        set(get().accountUserId ? { items } : { items, guestItems: items });
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
        if (getPurchasableUnits(item) <= 0) {
          return toast({
            description: isPresaleItem(item)
              ? "Se acabaron las reservas de este producto."
              : "Este producto está agotado por ahora; te avisamos cuando vuelva desde su página.",
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
          return toast({
            description: "Este producto no está disponible en este momento.",
            variant: "warning",
          });
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
        if (getPurchasableUnits(item) <= 0) {
          toast({
            description: isPresaleItem(item)
              ? "Se acabaron las reservas de este producto."
              : "Este producto está agotado por ahora.",
            variant: "warning",
          });
          return false;
        }
        if (cartItems.some((cartItem) => cartItem.id === id)) {
          toast({
            description: "Este producto ya está en tu carrito.",
            variant: "info",
            icon: <ToastIcon icon="cart" variant="info" />,
          });
          return false;
        }
        const result = addToCart(item);
        if (!result.ok) {
          toast({
            description: "Este producto no está disponible en este momento.",
            variant: "warning",
          });
          return false;
        }
        toast({
          description: "Producto agregado al carrito.",
          variant: "success",
          icon: <ToastIcon icon="cart" variant="success" />,
        });
        return true;
      },
      addMany: (products: Product[]) => {
        const current = get().items;
        const known = new Set(current.map((item) => item.id));
        const fresh = products
          .filter((product) => !known.has(product.id))
          .map((product) => ({
            ...product,
            addedOn: new Date(),
            savedAsGroup: Boolean(product.isGroup),
          }));
        if (fresh.length === 0) return 0;
        const items = [...current, ...fresh];
        set(get().accountUserId ? { items } : { items, guestItems: items });
        return fresh.length;
      },
      refreshItems: (products: Product[], families: Product[] = []) => {
        const items = refreshWishlistItems(get().items, products, families);
        set(get().accountUserId ? { items } : { items, guestItems: items });
      },
      moveToCartMultiple: (ids: string[]) => {
        ids.forEach((id) => {
          get().moveToCart(id);
        });
      },
      clearWishlist: () =>
        set(
          get().accountUserId ? { items: [] } : { items: [], guestItems: [] },
        ),
      setAccountItems: (items, userId) => set({ items, accountUserId: userId }),
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
        ({
          guestItems: state.guestItems.map((item) => ({
            ...slimStoredProduct(item),
            addedOn: item.addedOn,
            savedAsGroup: item.savedAsGroup,
          })),
        }) as unknown as WishlistStore,
      migrate: (persisted, version) => {
        const state = persisted as Partial<WishlistStore>;
        if (version < 1 && Array.isArray(state.guestItems)) {
          return {
            ...state,
            guestItems: state.guestItems.map((item) => ({
              ...slimStoredProduct(item),
              addedOn: item.addedOn,
            })),
          } as WishlistStore;
        }
        return state as WishlistStore;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
