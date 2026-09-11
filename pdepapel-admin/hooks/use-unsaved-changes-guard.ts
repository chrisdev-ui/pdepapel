"use client";

import { useCallback, useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

import { useActionConfirmation } from "@/hooks/use-action-confirmation";

interface UseUnsavedChangesGuardOptions {
  /** Desactiva la guarda mientras se envía o cuando ya se guardó. */
  enabled?: boolean;
}

/**
 * Aviso antes de perder cambios sin guardar, compartido por los formularios
 * del panel: al recargar o cerrar la pestaña (`beforeunload`) y al salir con
 * el botón de volver (`confirmLeave`). Se apoya en `isDirty` de
 * react-hook-form, así que no dispara nada en un formulario recién abierto.
 */
export function useUnsavedChangesGuard<T extends FieldValues>(
  form: UseFormReturn<T>,
  { enabled = true }: UseUnsavedChangesGuardOptions = {},
) {
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const isDirty = form.formState.isDirty;
  const active = enabled && isDirty;

  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  /** `true` cuando se puede salir: sin cambios, o con la confirmación de la persona. */
  const confirmLeave = useCallback(async () => {
    if (!active) return true;
    return requestConfirmation({
      title: "¿Salir sin guardar?",
      description: "Perderás los cambios que no hayas guardado.",
      confirmLabel: "Salir sin guardar",
      cancelLabel: "Seguir editando",
      destructive: true,
    });
  }, [active, requestConfirmation]);

  return { isDirty, confirmLeave, confirmationDialog };
}
