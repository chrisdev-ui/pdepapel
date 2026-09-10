"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface RadioCardOption<T extends string> {
  value: T;
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Notas cortas debajo del texto (por ejemplo, lo que implica elegirla). */
  bullets?: string[];
}

interface RadioCardsProps<T extends string> {
  value: T | undefined;
  onChange: (value: T) => void;
  options: RadioCardOption<T>[];
  /** Nombre accesible del grupo. */
  label: string;
  /** Prefijo para los ids de cada opción. */
  idPrefix: string;
  disabled?: boolean;
  columns?: 1 | 2 | 3;
  className?: string;
}

/**
 * Tarjetas que se comportan como radios: una sola implementación para el
 * tipo de pedido, el tipo de envío, la forma del producto y la decisión de
 * la guía. Radio real (teclado, foco, lector de pantalla) con el look de
 * tarjeta que ya usaba la sección de envío.
 */
export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  label,
  idPrefix,
  disabled,
  columns = 3,
  className,
}: RadioCardsProps<T>) {
  const cols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
  }[columns];

  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className={cn("grid gap-3", cols, className)}
      disabled={disabled}
      aria-label={label}
    >
      {options.map((option) => {
        const id = `${idPrefix}-${option.value}`;
        const isOff = disabled || option.disabled;
        const active = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className={cn(
              "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 text-left transition-colors hover:border-primary/40",
              active && "border-primary bg-accent/40",
              isOff && "cursor-not-allowed opacity-60 hover:border-border",
            )}
          >
            <RadioGroupItem
              value={option.value}
              id={id}
              className="mt-0.5"
              disabled={option.disabled}
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 font-semibold text-primary">
                {option.icon}
                {option.title}
              </span>
              {option.hint && (
                <span className="text-xs font-normal text-muted-foreground">
                  {option.hint}
                </span>
              )}
              {option.bullets && option.bullets.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs font-normal text-muted-foreground">
                  {option.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
