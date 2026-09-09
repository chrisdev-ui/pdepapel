"use client";

import { Bell } from "lucide-react";

import { EarlyAccessForm } from "@/components/home/early-access-form";

interface NotifyMeFormProps {
  productId: string;
  arrivalLabel: string | null;
}

/** Ficha de un producto «Próximamente»: pide el correo en lugar de vender. */
export function NotifyMeForm({ productId, arrivalLabel }: NotifyMeFormProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-kawaii-lavender-light/50 p-4">
      <p className="inline-flex items-center gap-2 font-sans text-sm font-bold text-blue-yankees">
        <Bell aria-hidden="true" className="h-4 w-4" />
        {arrivalLabel ?? "Llega pronto"} · te avisamos cuando esté en la tienda
      </p>
      <EarlyAccessForm label="Avísame cuando llegue" source="producto" productId={productId} />
    </div>
  );
}
