"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TintBadge } from "@/components/ui/tint-badge";

export interface ConfirmDialogState {
  label: string;
  tone: string;
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** De dónde a dónde pasa el pedido; sin `to`, solo se muestra `from`. */
  from?: ConfirmDialogState;
  to?: ConfirmDialogState;
  /** Texto corto junto a las insignias: método de pago, transportadora. */
  meta?: string;
  consequences: string[];
  children?: ReactNode;
  footnote?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

/**
 * Un solo diálogo para todo cambio que no se deshace: de qué estado a cuál,
 * qué pasa al confirmar, y el dato que falta (referencia, guía). Lo usan las
 * acciones de estado y la salida con cambios sin guardar.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  from,
  to,
  meta,
  consequences,
  children,
  footnote,
  confirmLabel,
  cancelLabel = "Volver",
  destructive = false,
  disabled = false,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {from && <TintBadge label={from.label} tone={from.tone} />}
              {from && to && (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              {to && <TintBadge label={to.label} tone={to.tone} />}
              {meta && <span>{meta}</span>}
            </div>
          </DialogDescription>
        </DialogHeader>
        {consequences.length > 0 && (
          <ul className="flex flex-col gap-2 rounded-lg bg-muted px-3.5 py-3 text-sm text-primary/90">
            {consequences.map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
        {children}
        <DialogFooter className="gap-2 sm:items-center sm:justify-between">
          {footnote && (
            <span className="text-xs text-muted-foreground">{footnote}</span>
          )}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              onClick={onConfirm}
              disabled={disabled || loading}
              isLoading={loading}
              loadingText="Guardando…"
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
