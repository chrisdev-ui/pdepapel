"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LabelSheetOptions } from "@/lib/label-printing";

export const OFFSET_STEP_MM = 0.5;
export const OFFSET_LIMIT_MM = 15;

const clamp = (value: number) =>
  Math.min(Math.max(Math.round(value * 10) / 10, -OFFSET_LIMIT_MM), OFFSET_LIMIT_MM);

interface PrintOffsetFieldsProps {
  value: LabelSheetOptions;
  onChange: (next: LabelSheetOptions) => void;
  /** Distingue los ids cuando el control aparece dos veces en la página. */
  idPrefix?: string;
  compact?: boolean;
}

/**
 * «Desplazar impresión»: dos campos con nombre (horizontal y vertical), en
 * milímetros, con botones de ±0,5. Antes eran dos cajas «0 0» bajo un solo
 * rótulo y la segunda no tenía nombre visible: nadie sabía cuál era la
 * vertical ni que existía.
 */
export function PrintOffsetFields({ value, onChange, idPrefix = "label-offset", compact = false }: PrintOffsetFieldsProps) {
  const field = (axis: "offsetXMm" | "offsetYMm", label: string, hint: string) => {
    const id = `${idPrefix}-${axis === "offsetXMm" ? "x" : "y"}`;
    const current = value[axis];
    const set = (next: number) => onChange({ ...value, [axis]: clamp(next) });
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id} className={compact ? "text-xs" : undefined}>
          {label}
        </Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`${label}: restar ${OFFSET_STEP_MM} mm`}
            onClick={() => set(current - OFFSET_STEP_MM)}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            step={OFFSET_STEP_MM}
            min={-OFFSET_LIMIT_MM}
            max={OFFSET_LIMIT_MM}
            value={current}
            onChange={(event) => set(Number(event.target.value) || 0)}
            className={compact ? "h-8 w-20 text-center text-sm" : "w-24 text-center"}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`${label}: sumar ${OFFSET_STEP_MM} mm`}
            onClick={() => set(current + OFFSET_STEP_MM)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-xs text-muted-foreground">mm</span>
        </div>
        {!compact && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    );
  };
  return (
    <div className={compact ? "flex flex-wrap items-end gap-4" : "grid gap-4 sm:grid-cols-2"}>
      {field("offsetXMm", "Horizontal", "Positivo mueve todo a la derecha; negativo, a la izquierda.")}
      {field("offsetYMm", "Vertical", "Positivo baja todo; negativo lo sube. Si la primera fila se corta arriba, suma.")}
    </div>
  );
}
