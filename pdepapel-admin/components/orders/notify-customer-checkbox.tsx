"use client";

import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const NOTIFY_CUSTOMER_LABEL = "Avisar a la clienta";
export const NOTIFY_CUSTOMER_HELP =
  "Si lo desmarcas, el cambio no le manda correo ni WhatsApp. Las tarjetas de regalo pagadas sí se entregan.";

/** «Avisar a la clienta» al cambiar el estado de un pedido (marcada por defecto). */
export function NotifyCustomerCheckbox({
  checked,
  onCheckedChange,
  disabled,
  className,
  help = NOTIFY_CUSTOMER_HELP,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  /** La ayuda debajo de la casilla, cuando el caso pide otra (p. ej. al vincular una guía). */
  help?: string;
}) {
  const id = useId();
  const helpId = `${id}-ayuda`;
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          aria-describedby={helpId}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        {NOTIFY_CUSTOMER_LABEL}
      </label>
      <p id={helpId} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );
}
