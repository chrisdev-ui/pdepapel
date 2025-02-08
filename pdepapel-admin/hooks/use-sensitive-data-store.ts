import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SensistiveDataState {
  [key: string]: {
    isVisible: boolean;
  };
}

interface SensistiveDataStore {
  cards: SensistiveDataState;
  toggleVisibility: (card: string) => void;
}

export const useSensitiveDataStore = create<SensistiveDataStore>()(
  persist(
    (set) => ({
      cards: {},
      toggleVisibility: (cardId: string) => {
        set((state) => ({
          cards: {
            ...state.cards,
            [cardId]: {
              isVisible: !(state.cards[cardId]?.isVisible ?? true),
            },
          },
        }));
      },
    }),
    {
      name: "sensitive-data-store",
    },
  ),
);
