import { create } from "zustand";

interface CartSheetStore {
  isOpen: boolean;
  /** Producto recién agregado: el panel lo resalta al abrirse. */
  highlightId: string | null;
  open: (highlightId?: string) => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

// El panel lateral del carrito se abre desde la cabecera, la barra fija del
// teléfono y al agregar desde la ficha del producto.
export const useCartSheet = create<CartSheetStore>((set) => ({
  isOpen: false,
  highlightId: null,
  open: (highlightId) => set({ isOpen: true, highlightId: highlightId ?? null }),
  close: () => set({ isOpen: false, highlightId: null }),
  setOpen: (open) => set(open ? { isOpen: true } : { isOpen: false, highlightId: null }),
}));
