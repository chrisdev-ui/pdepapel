"use client";

import { Tag } from "lucide-react";

import { buildLadder, type PriceTier } from "@/lib/price-tiers";
import { cn, currencyFormatter } from "@/lib/utils";

interface PriceTierLadderProps {
  /** Precio de lista, sobre el que se calcula el ahorro de cada peldaño. */
  basePrice: number;
  tiers: PriceTier[];
  /** Cantidad elegida ahora, para resaltar el peldaño vigente. */
  quantity: number;
  className?: string;
}

/**
 * La escalera de precio por cantidad, dicha antes de comprar.
 *
 * No es propia de las cápsulas: cualquier producto con peldaños la muestra.
 * Se resalta el peldaño vigente para que el comprador vea qué está pagando
 * ahora, y el siguiente le dice cuánto le falta para bajar de precio.
 */
export function PriceTierLadder({
  basePrice,
  tiers,
  quantity,
  className,
}: PriceTierLadderProps) {
  const ladder = buildLadder(basePrice, tiers);
  if (ladder.length === 0) return null;

  // El peldaño vigente: el más alto que no pasa de lo elegido.
  const activeIndex = ladder.reduce(
    (winner, rung, index) => (rung.minQuantity <= quantity ? index : winner),
    -1,
  );
  const next = ladder[activeIndex + 1];

  return (
    <div
      className={cn(
        "rounded-xl bg-kawaii-mint-light/50 px-4 py-3 font-sans text-sm text-blue-yankees",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-semibold">
        <Tag aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span>Entre más lleves, menos cuesta cada una</span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ladder.map((rung, index) => (
          <li
            key={rung.minQuantity}
            aria-current={index === activeIndex ? "true" : undefined}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 tabular-nums",
              index === activeIndex
                ? "border-green-700 bg-white font-bold text-green-800"
                : "border-transparent bg-white/70 text-gray-700",
            )}
          >
            <span className="whitespace-nowrap">
              {rung.minQuantity === 1 ? "1" : `${rung.minQuantity}+`} ·{" "}
              {currencyFormatter.format(rung.unitPrice)} c/u
            </span>
            {rung.savedPct > 0 && (
              <span className="ml-1 whitespace-nowrap text-xs font-bold text-green-700">
                −{rung.savedPct} %
              </span>
            )}
          </li>
        ))}
      </ul>
      {next && (
        <p className="mt-2 text-xs text-gray-600">
          Lleva {next.minQuantity - quantity === 1 ? "1 más" : `${next.minQuantity - quantity} más`} y
          cada una te queda en {currencyFormatter.format(next.unitPrice)}.
        </p>
      )}
    </div>
  );
}
