import { useEffect, useRef } from "react";
import { FieldValues, UseFormReturn } from "react-hook-form";
import { useFormPersistenceStore } from "./use-form-persistence-store";

interface UseFormPersistProps<T extends FieldValues> {
  form: UseFormReturn<T>;
  key: string;
  exclude?: (keyof T)[];
}

export function useFormPersist<T extends FieldValues>({
  form,
  key,
  exclude = [],
}: UseFormPersistProps<T>) {
  const isLoaded = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const setFormData = useFormPersistenceStore((state) => state.setFormData);
  const clearFormData = useFormPersistenceStore((state) => state.clearFormData);

  // Use ref for exclude to prevent effect re-running on array reference change
  const excludeRef = useRef(exclude);
  useEffect(() => {
    excludeRef.current = exclude;
  }, [exclude]);

  // Restore data on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!isLoaded.current) {
      // Access store directly to avoid unnecessary subscriptions/re-renders
      const savedData = useFormPersistenceStore.getState().forms[key] as
        | Partial<T>
        | undefined;

      if (savedData && typeof savedData === "object") {
        try {
          if (excludeRef.current.length > 0) {
            excludeRef.current.forEach((k) => {
              if (k in savedData) {
                delete savedData[k];
              }
            });
          }

          const currentValues = form.getValues();
          const merged = { ...currentValues, ...savedData };

          form.reset(merged);
        } catch (error) {
          console.error("Error restoring form data:", error);
        }
      }
      isLoaded.current = true;
    }
  }, [key, form]);

  // Save data on change
  useEffect(() => {
    const subscription = form.watch(() => {
      if (!isLoaded.current) return;

      const dataToSave = form.getValues();

      if (excludeRef.current.length > 0) {
        excludeRef.current.forEach((k) => {
          delete (dataToSave as any)[k];
        });
      }

      // Debounce saving to store/localstorage
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setFormData(key, dataToSave);
      }, 1000);
    });

    return () => {
      subscription.unsubscribe();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [form, key, setFormData]);

  const clearStorage = () => {
    clearFormData(key);
  };

  return { clearStorage };
}
