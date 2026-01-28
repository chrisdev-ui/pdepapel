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

  // Restore data on mount - ONLY for new records, never for existing ones
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Skip restoration for existing records - server data is authoritative
    // Keys for existing orders look like: 'order-form-{storeId}-{orderId}'
    // Keys for new orders look like: 'order-form-{storeId}-new'
    const isNewRecord = key.endsWith("-new");

    if (!isLoaded.current) {
      if (isNewRecord) {
        // Only restore saved data for NEW records (drafts)
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
      }
      // For existing records, we skip restoration - form already has fresh server data
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
    // Cancel any pending debounced saves to prevent race condition
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    clearFormData(key);
  };

  return { clearStorage };
}
