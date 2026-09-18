"use client";

import { DiscountType } from "@prisma/client";
import { useRef } from "react";

import { cn } from "@/lib/utils";

const OPTIONS: { value: DiscountType; text: string; label: string }[] = [
  { value: DiscountType.PERCENTAGE, text: "%", label: "Porcentaje" },
  { value: DiscountType.FIXED, text: "$ fijo", label: "Monto fijo" },
];

interface DiscountTypeToggleProps {
  value: DiscountType | undefined;
  onChange: (value: DiscountType) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * Selector % / $ fijo compartido por ofertas y cupones. Un solo tabulador entra
 * al grupo; las flechas mueven la selección (roving tabindex, como un radiogroup).
 */
export function DiscountTypeToggle({ value, onChange, disabled = false, className, id }: DiscountTypeToggleProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = OPTIONS.findIndex((option) => option.value === value);
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const move = (from: number, delta: number) => {
    const next = (from + delta + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div id={id} role="radiogroup" aria-label="Tipo de descuento" className={cn("flex h-10 gap-1 rounded-md border bg-muted/40 p-1", className)}>
      {OPTIONS.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            tabIndex={index === tabbableIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                move(index, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                move(index, -index);
              } else if (event.key === "End") {
                event.preventDefault();
                move(index, OPTIONS.length - 1 - index);
              } else if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                onChange(option.value);
              }
            }}
            className={cn(
              "flex-1 rounded text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
              checked ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-primary",
            )}
          >
            {option.text}
          </button>
        );
      })}
    </div>
  );
}
