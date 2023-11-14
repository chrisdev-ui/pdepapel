import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface GuestUser {
  guestId: string | null;
  setGuestId: (id: string) => void;
  clearGuestId: () => void;
}

export const useGuestUser = create(
  persist<GuestUser>(
    (set) => ({
      guestId: null,
      setGuestId: (id) => set({ guestId: id }),
      clearGuestId: () => set({ guestId: null }),
    }),
    {
      name: "guest-user-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
