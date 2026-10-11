import { create } from "zustand";

/**
 * El producto que se está mirando, para que el botón flotante de WhatsApp
 * (que vive en el layout) arme el texto con su nombre y referencia. La ficha
 * lo pone al montarse y lo quita al salir.
 */
interface WhatsAppContextStore {
  product: { name: string; ref: string } | null;
  setProduct: (product: { name: string; ref: string } | null) => void;
}

export const useWhatsAppContext = create<WhatsAppContextStore>((set) => ({
  product: null,
  setProduct: (product) => set({ product }),
}));
