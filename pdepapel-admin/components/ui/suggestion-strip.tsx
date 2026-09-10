"use client";

import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";
import type { ReactNode } from "react";

interface SuggestionStripProps {
  /** Frase completa con el valor en <strong>. */
  children: ReactNode;
  actionLabel: string;
  onApply: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Una sugerencia con su botón "Usar": el precio calculado, el precio de un
 * kit, cualquier valor que el sistema propone pero no escribe solo. Un solo
 * componente para que el gesto se vea igual en todas partes.
 */
export function SuggestionStrip({
  children,
  actionLabel,
  onApply,
  disabled,
  className,
}: SuggestionStripProps) {
  return (
    <div
      className={
        "flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center " +
        (className ?? "")
      }
    >
      <Calculator
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
        {children}
      </p>
      <Button
        type="button"
        variant="soft"
        size="xs"
        disabled={disabled}
        onClick={onApply}
        className="shrink-0"
      >
        {actionLabel}
      </Button>
    </div>
  );
}
