import { create } from "zustand";

interface UseStoreSettingsStore {
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
}

export const useStoreSettings = create<UseStoreSettingsStore>((set) => ({
  logoUrl: null,
  setLogoUrl: (url) => set({ logoUrl: url }),
}));
