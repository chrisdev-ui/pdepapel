"use client";

import { Bell } from "lucide-react";

import { EarlyAccessForm } from "@/components/home/early-access-form";
import { cn } from "@/lib/utils";

type NotifyMeVariant = "coming-soon" | "sold-out";

interface NotifyMeFormProps {
  productId: string;
  arrivalLabel: string | null;
  variant?: NotifyMeVariant;
  className?: string;
  /** Mostrar el campo de correo de una vez, sin el botón de apertura. */
  open?: boolean;
  /** Ocultar la línea de estado cuando ya la muestra el bloque de señales. */
  showHeadline?: boolean;
}

const COPY: Record<NotifyMeVariant, { fallback: string; tail: string; label: string }> = {
  "coming-soon": { fallback: "Llega pronto", tail: "te avisamos cuando esté en la tienda", label: "Avísame cuando llegue" },
  "sold-out": { fallback: "Agotado por ahora", tail: "te avisamos cuando vuelva", label: "Avísame cuando vuelva" },
};

/** Ficha de un producto «Próximamente» o agotado: pide el correo en lugar de vender. */
export function NotifyMeForm({ productId, arrivalLabel, variant = "coming-soon", className, open = false, showHeadline = true }: NotifyMeFormProps) {
  const copy = COPY[variant];
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl bg-kawaii-lavender-light/50 p-4", className)}>
      <p className="inline-flex items-center gap-2 font-sans text-sm font-bold text-blue-yankees">
        <Bell aria-hidden="true" className="h-4 w-4" />
        {showHeadline ? `${arrivalLabel ?? copy.fallback} · ${copy.tail}` : copy.tail.charAt(0).toUpperCase() + copy.tail.slice(1)}
      </p>
      <EarlyAccessForm label={copy.label} source="producto" productId={productId} open={open} />
    </div>
  );
}
