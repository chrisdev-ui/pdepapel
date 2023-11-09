import { Product } from "@/types";
import { create } from "zustand";

interface CheckoutModalStore {
  isOpen: boolean;
  data?: Product[];
  callback?: () => void;
  onOpen: (data: Product[], callback?: () => void) => void;
  onClose: () => void;
}

export const useCheckoutModal = create<CheckoutModalStore>((set) => ({
  isOpen: false,
  data: undefined,
  callback: undefined,
  onOpen: (data: Product[], callback?: () => void) =>
    set({ data, isOpen: true, callback }),
  onClose: () => set({ isOpen: false }),
}));
