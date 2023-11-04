import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ToastIcon } from "@/components/ui/toast-icon";
import { toast } from "@/hooks/use-toast";
import { Product } from "@/types";

interface CartStore {
  items: Product[];
  addItem: (item: Product, quantity?: number) => void;
  updateQuantity: (id: string, quantity: number) => void;
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

        if (existingItem) {
          if (
            existingItem.quantity &&
            existingItem.quantity + quantity <= existingItem.stock
          ) {
            existingItem.quantity += quantity;
            set({ items: [...currentItems] });
            toast({
              description: "Producto agregado al carrito.",
              variant: "success",
              icon: <ToastIcon icon="cart" variant="success" />,
            });
          } else {
            toast({
              description: "No hay más stock de este producto.",
              variant: "warning",
              icon: <ToastIcon icon="cart" variant="warning" />,
            });
          }
        } else {
          const newItem: Product = {
            ...item,
            quantity,
          };
          set({ items: [...currentItems, newItem] });
          toast({
            description: "Producto agregado al carrito.",
            variant: "success",
            icon: <ToastIcon icon="cart" variant="success" />,
          });
        }
      },
      updateQuantity: (id: string, quantity: number) => {
        const currentItems = get().items;
        const item = currentItems.find((i) => i.id === id);

        if (item && quantity <= item.stock) {
          item.quantity = quantity;
          set({ items: [...currentItems] });
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
