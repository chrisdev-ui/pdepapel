import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ToastIcon } from "@/components/ui/toast-icon";
import { toast } from "@/hooks/use-toast";
import { isComingSoon } from "@/lib/product-card";
import { slimStoredProduct } from "@/lib/stored-product";
import { Product } from "@/types";

export type CartMutationResult =
  | { ok: true; status: "added" | "updated"; item: Product }
  | {
      ok: false;
      status: "stock_limit" | "unavailable";
      item: Product | null;
    };

interface CartStore {
  items: Product[];
  addItem: (item: Product, quantity?: number) => CartMutationResult;
  updateQuantity: (id: string, quantity: number) => CartMutationResult;
  updateStock: (id: string, stock: number) => void;
  /** Refresca stock y precio con el catálogo actual; la cantidad se ajusta al stock. */
  syncProduct: (product: Product) => void;
  removeItem: (id: string) => void;
  removeAll: () => void;
}

export const useCart = create(
  persist<CartStore>(
    (set, get) => ({
      items: [],
      addItem: (item: Product, quantity: number = 1) => {
        const currentItems = get().items;
        const existingItem = currentItems.find((i) => i.id === item.id);
        const requestedQuantity = Math.max(1, Math.floor(quantity));

        if (item.isArchived || item.stock <= 0 || isComingSoon(item)) {
          return { ok: false, status: "unavailable", item };
        }

        if (existingItem) {
          const nextQuantity = (existingItem.quantity ?? 1) + requestedQuantity;
          if (nextQuantity > existingItem.stock) {
            return { ok: false, status: "stock_limit", item: existingItem };
          }

          const updatedItem = { ...existingItem, quantity: nextQuantity };
          set({
            items: currentItems.map((currentItem) =>
              currentItem.id === item.id ? updatedItem : currentItem,
            ),
          });
          return { ok: true, status: "updated", item: updatedItem };
        }

        if (item.stock < requestedQuantity) {
          return { ok: false, status: "stock_limit", item };
        }

        const newItem: Product = {
          ...item,
          quantity: requestedQuantity,
        };
        set({ items: [...currentItems, newItem] });
        return { ok: true, status: "added", item: newItem };
      },
      updateQuantity: (id: string, quantity: number) => {
        const currentItems = get().items;
        const item = currentItems.find((i) => i.id === id);

        if (!item || item.isArchived || item.stock <= 0 || quantity < 0) {
          return { ok: false, status: "unavailable", item: item ?? null };
        }
        if (quantity > item.stock) {
          return { ok: false, status: "stock_limit", item };
        }

        const updatedItem = { ...item, quantity };
        set({
          items: currentItems.map((currentItem) =>
            currentItem.id === id ? updatedItem : currentItem,
          ),
        });
        return { ok: true, status: "updated", item: updatedItem };
      },
      updateStock: (id: string, stock: number) => {
        const currentItems = get().items;
        const item = currentItems.find((i) => i.id === id);

        if (item) {
          const updatedItem = {
            ...item,
            stock,
            quantity:
              item.quantity && item.quantity > stock
                ? Math.max(0, stock)
                : item.quantity,
          };
          set({
            items: currentItems.map((currentItem) =>
              currentItem.id === id ? updatedItem : currentItem,
            ),
          });
        }
      },
      syncProduct: (product: Product) => {
        const currentItems = get().items;
        const item = currentItems.find((i) => i.id === product.id);
        if (!item) return;
        const quantity = item.quantity && item.quantity > product.stock ? Math.max(0, product.stock) : item.quantity;
        const updatedItem: Product = {
          ...item,
          stock: product.stock,
          price: product.price,
          originalPrice: product.originalPrice,
          discountedPrice: product.discountedPrice,
          hasDiscount: product.hasDiscount,
          offerLabel: product.offerLabel,
          isArchived: product.isArchived,
          availableAt: product.availableAt,
          images: product.images?.length ? product.images : item.images,
          quantity,
        };
        set({ items: currentItems.map((currentItem) => (currentItem.id === product.id ? updatedItem : currentItem)) });
      },
      removeItem: (id: string) => {
        set({ items: [...get().items.filter((i) => i.id !== id)] });
        toast({
          description: "Producto eliminado del carrito.",
          variant: "info",
          icon: <ToastIcon icon="cart" variant="info" />,
        });
      },
      removeAll: () => set({ items: [] }),
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ items: state.items.map(slimStoredProduct) }) as unknown as CartStore,
      migrate: (persisted, version) => {
        const state = persisted as Partial<CartStore>;
        if (version < 1 && Array.isArray(state.items)) {
          return { ...state, items: state.items.map(slimStoredProduct) } as CartStore;
        }
        return state as CartStore;
      },
    },
  ),
);
