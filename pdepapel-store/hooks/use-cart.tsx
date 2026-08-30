import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ToastIcon } from "@/components/ui/toast-icon";
import { toast } from "@/hooks/use-toast";
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

        if (item.isArchived || item.stock <= 0) {
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
    },
  ),
);
