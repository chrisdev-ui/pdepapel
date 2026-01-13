import { useCallback, useEffect } from "react";
import { FieldErrors, FieldValues, UseFormReturn } from "react-hook-form";
import { useToast } from "./use-toast";

/**
 * Hook that shows a toast notification when form validation fails on submit.
 * This helps the admin know that there are validation errors they need to fix.
 */
export function useFormValidationToast<T extends FieldValues>({
  form,
}: {
  form: UseFormReturn<T>;
}) {
  const { toast } = useToast();
  const { formState } = form;
  const { errors, isSubmitted, submitCount } = formState;

  const getFirstErrorMessage = useCallback(
    (fieldErrors: FieldErrors<T>): string | null => {
      const keys = Object.keys(fieldErrors);
      if (keys.length === 0) return null;

      const firstKey = keys[0];
      const firstError = fieldErrors[firstKey as keyof typeof fieldErrors];

      if (!firstError) return null;

      // Direct error with message
      if (
        typeof firstError === "object" &&
        "message" in firstError &&
        typeof firstError.message === "string"
      ) {
        return firstError.message;
      }

      // Array field errors (e.g., items[0].name)
      if (Array.isArray(firstError)) {
        const firstArrayItem = firstError.find((item) => item !== undefined);
        if (firstArrayItem) {
          return getFirstErrorMessage(
            firstArrayItem as unknown as FieldErrors<T>,
          );
        }
      }

      // Nested object errors
      if (typeof firstError === "object" && !("message" in firstError)) {
        return getFirstErrorMessage(firstError as unknown as FieldErrors<T>);
      }

      return null;
    },
    [],
  );

  // Show toast when form is submitted with errors
  useEffect(() => {
    if (isSubmitted && Object.keys(errors).length > 0) {
      const errorCount = Object.keys(errors).length;
      const firstMessage = getFirstErrorMessage(errors);

      toast({
        title: "Error en el formulario",
        description:
          errorCount === 1
            ? firstMessage || "Por favor, revisa el campo con error."
            : `Hay ${errorCount} campos con errores. ${firstMessage || "Por favor, revísalos."}`,
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount]);
}
