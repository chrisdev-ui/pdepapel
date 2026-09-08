"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  /** Pregunta concreta: «¿Eliminar este producto?». */
  title?: string;
  /** Qué pasa después; menciona si se puede deshacer. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción que borra o no se puede deshacer: botón rojo. */
  destructive?: boolean;
}

/**
 * Confirmación del kit (rediseño 2026-09). Usa el mismo AlertDialog que las
 * confirmaciones nuevas: título como pregunta, consecuencia en la descripción,
 * cancelar a la izquierda y la acción a la derecha. Conserva la API antigua
 * (`isOpen`, `onClose`, `onConfirm`, `loading`) para no tocar cada llamada.
 */
export function AlertModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  title = "¿Eliminar de forma definitiva?",
  description = "Esta acción no se puede deshacer.",
  confirmLabel = "Sí, eliminar",
  cancelLabel = "Cancelar",
  destructive = true,
}: AlertModalProps) {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading} onClick={onClose}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className={cn(destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            {loading ? "Procesando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
