"use client";

import { Check, Truck } from "lucide-react";

import { cn, currencyFormatter } from "@/lib/utils";

interface FreeShippingProgressProps {
  subtotal: number;
  threshold: number | null;
  /**
   * El subtotal aún no se conoce: en la ficha del producto depende del carrito,
   * que vive en el navegador. Mientras tanto NO se enseña una cifra calculada
   * con el carrito vacío —diría que falta más de lo que falta— sino este estado
   * neutro, del mismo alto para que nada se mueva al resolverse.
   */
  pending?: boolean;
  className?: string;
}

/** Cuánto falta para el envío gratis; no se muestra si la tienda no tiene umbral. */
export function FreeShippingProgress({ subtotal, threshold, pending = false, className }: FreeShippingProgressProps) {
  if (!threshold || threshold <= 0) return null;

  const remaining = Math.max(threshold - subtotal, 0);
  const unlocked = !pending && remaining === 0;
  const percent = pending ? 0 : Math.min(Math.round((subtotal / threshold) * 100), 100);

  return (
    <div role="status" className={cn("flex flex-col gap-1.5 font-sans text-sm text-blue-yankees", className)}>
      <p className="flex items-center gap-2 font-semibold">
        {unlocked ? (
          <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-green-600" />
        ) : (
          <Truck aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        {pending ? (
          <span className="text-gray-500">Calculando tu envío gratis…</span>
        ) : unlocked ? (
          <span>¡Tu pedido tiene envío gratis!</span>
        ) : (
          <span>
            Te faltan <strong>{currencyFormatter.format(remaining)}</strong> para el envío gratis
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Progreso hacia el envío gratis"
        aria-busy={pending || undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pending ? undefined : percent}
        className="h-2 w-full overflow-hidden rounded-full bg-blue-baby/60"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", unlocked ? "bg-green-600" : "bg-blue-yankees")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
