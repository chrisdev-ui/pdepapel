import { useEffect } from "react";
import { FieldValues, UseFormReturn } from "react-hook-form";

import { getFirstFormErrorMessage } from "@/lib/form-errors";
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

  // Show toast when form is submitted with errors
  useEffect(() => {
    if (isSubmitted && Object.keys(errors).length > 0) {
      const errorCount = Object.keys(errors).length;
      const firstMessage = getFirstFormErrorMessage(errors);

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
