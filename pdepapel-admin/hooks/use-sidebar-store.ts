import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SidebarStore {
  /** Barra contraída a iconos (escritorio y portátil). */
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: "admin-sidebar" },
  ),
);
