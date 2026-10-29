import { create } from "zustand";

import { Product } from "@/types";

interface PresaleCartConflict {
  product: Product;
  quantity: number;
  /** Para la analítica de «Vaciar y reservar». */
  uiSource: string;
}

interface PresaleCartConflictStore {
  pending: PresaleCartConflict | null;
  ask: (conflict: PresaleCartConflict) => void;
  dismiss: () => void;
}

/** La pregunta «¿Vaciar el carrito y reservar solo …?»; el diálogo vive en `ModalProvider`. */
export const usePresaleCartConflict = create<PresaleCartConflictStore>((set) => ({
  pending: null,
  ask: (conflict) => set({ pending: conflict }),
  dismiss: () => set({ pending: null }),
}));
