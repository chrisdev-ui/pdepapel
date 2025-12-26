import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface FormPersistenceStore {
  forms: Record<string, unknown>;
  setFormData: <T>(key: string, data: T) => void;
  clearFormData: (key: string) => void;
  clearAll: () => void;
}

export const useFormPersistenceStore = create(
  persist<FormPersistenceStore>(
    (set) => ({
      forms: {},
      setFormData: (key, data) =>
        set((state) => ({
          forms: { ...state.forms, [key]: data },
        })),
      clearFormData: (key) =>
        set((state) => {
          const newForms = { ...state.forms };
          delete newForms[key];
          return { forms: newForms };
        }),
      clearAll: () => set({ forms: {} }),
    }),
    {
      name: "form-persistence-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
