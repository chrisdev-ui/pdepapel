import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ToastIcon } from "@/components/ui/toast-icon";
import { Product } from "@/types";
import { toast } from "./use-toast";

interface CartStore {
  items: Product[];
  addItem: (item: Product) => void;
  removeItem: (id: string) => void;
  removeAll: () => void;
}

export const useCart = create(
  persist<CartStore>(
    (set, get) => ({
      items: [],
      addItem: (item: Product) => {
        const currentItems = get().items;
        const existingItem = currentItems.find((i) => i.id === item.id);

        if (existingItem) {
          return toast({
            description: "El producto ya está en el carrito.",
            icon: <ToastIcon icon="cart" />,
          });
        }

        set({ items: [...get().items, item] });
        toast({
          description: "Producto agregado al carrito.",
          variant: "success",
          icon: <ToastIcon icon="cart" variant="success" />,
        });
      },
      removeItem: (id: string) => {
        set({ items: [...get().items.filter((i) => i.id !== id)] });
        toast({
          description: "Producto eliminado del carrito.",
          icon: <ToastIcon icon="cart" />,
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
