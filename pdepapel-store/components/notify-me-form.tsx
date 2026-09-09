"use client";

import { Bell } from "lucide-react";

import { EarlyAccessForm } from "@/components/home/early-access-form";

type NotifyMeVariant = "coming-soon" | "sold-out";

interface NotifyMeFormProps {
  productId: string;
  arrivalLabel: string | null;
  variant?: NotifyMeVariant;
}

const COPY: Record<NotifyMeVariant, { fallback: string; tail: string; label: string }> = {
  "coming-soon": { fallback: "Llega pronto", tail: "te avisamos cuando esté en la tienda", label: "Avísame cuando llegue" },
  "sold-out": { fallback: "Agotado por ahora", tail: "te avisamos cuando vuelva", label: "Avísame cuando vuelva" },
};

/** Ficha de un producto «Próximamente» o agotado: pide el correo en lugar de vender. */
export function NotifyMeForm({ productId, arrivalLabel, variant = "coming-soon" }: NotifyMeFormProps) {
  const copy = COPY[variant];
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-kawaii-lavender-light/50 p-4">
      <p className="inline-flex items-center gap-2 font-sans text-sm font-bold text-blue-yankees">
        <Bell aria-hidden="true" className="h-4 w-4" />
        {arrivalLabel ?? copy.fallback} · {copy.tail}
      </p>
      <EarlyAccessForm label={copy.label} source="producto" productId={productId} />
    </div>
  );
}
