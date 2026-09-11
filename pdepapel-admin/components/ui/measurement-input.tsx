import * as React from "react";

import { cn } from "@/lib/utils";

export interface MeasurementInputProps extends Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "value" | "onChange" | "min" | "step"
> {
  value?: number;
  onChange?: (value: number | undefined) => void;
  /** Se conserva por compatibilidad; la validación la hace el esquema del formulario. */
  min?: number;
  /**
   * Paso de la medida: decide cuántos decimales se aceptan al escribir
   * ("1" → enteros, "0.1" → un decimal, "0.01" → dos). Sin tooltip nativo.
   */
  step?: string | number;
  unit: string;
}

function decimalsFromStep(step: string | number | undefined) {
  const text = String(step ?? "0.1");
  const index = text.indexOf(".");
  return index === -1 ? 0 : text.length - index - 1;
}

/** "12,5" / "12.5" / "12" → 12.5; vacío o no numérico → undefined. */
function parseDraft(draft: string): number | undefined {
  const normalized = draft.trim().replace(",", ".");
  if (normalized === "" || normalized === "." || !/^\d*\.?\d*$/.test(normalized)) {
    return undefined;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/** Deja solo dígitos y un separador decimal (coma o punto), con `decimals` decimales como máximo. */
function sanitizeDraft(raw: string, decimals: number) {
  let result = "";
  let separator: string | null = null;
  let fraction = 0;
  for (const char of raw) {
    if (/\d/.test(char)) {
      if (separator !== null) {
        if (fraction >= decimals) continue;
        fraction += 1;
      }
      result += char;
      continue;
    }
    if ((char === "," || char === ".") && separator === null && decimals > 0) {
      separator = char;
      result += char;
    }
  }
  return result;
}

/** Cómo se muestra un número que llega de afuera (reset, datos del servidor): con coma. */
function formatDraft(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

/**
 * Campo de medida con unidad. Guarda un borrador de texto (para que "12," o
 * "0,5" no se corrompan mientras se escribe), acepta coma o punto y emite un
 * número o `undefined` cuando está vacío. Es `type="text"` con teclado
 * decimal: sin flechas, sin tooltip nativo de `step`.
 */
const MeasurementInput = React.forwardRef<
  HTMLInputElement,
  MeasurementInputProps
>(
  (
    {
      className,
      value,
      onChange,
      min: _min,
      step = "0.1",
      unit,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const decimals = decimalsFromStep(step);
    const [draft, setDraft] = React.useState(() => formatDraft(value));

    // Sincroniza el borrador cuando el valor cambia desde afuera (reset del
    // formulario, datos guardados) sin pisar lo que la persona está escribiendo.
    React.useEffect(() => {
      setDraft((current) => {
        const parsed = parseDraft(current);
        if (value === undefined) return parsed === undefined ? current : "";
        return parsed === value ? current : formatDraft(value);
      });
    }, [value]);

    return (
      <div className="relative min-w-0">
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          onChange={(event) => {
            const next = sanitizeDraft(event.target.value, decimals);
            setDraft(next);
            onChange?.(parseDraft(next));
          }}
          onBlur={(event) => {
            // Quita separadores colgantes ("12," → "12") sin cambiar el valor.
            setDraft((current) => current.replace(/[,.]$/, ""));
            onBlur?.(event);
          }}
          className={cn(
            "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
        >
          {unit}
        </span>
      </div>
    );
  },
);

MeasurementInput.displayName = "MeasurementInput";

export { MeasurementInput };
