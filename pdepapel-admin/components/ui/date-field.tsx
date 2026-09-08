"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { addDays, format, isValid, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";
import * as React from "react";

export interface DateFieldProps {
  id?: string;
  /** Nombre del campo oculto para formularios nativos (FormData). */
  name?: string;
  /** Fecha en formato ISO corto (yyyy-MM-dd). Sin valor: campo no controlado. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** Límites en formato yyyy-MM-dd. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  /** Muestra los atajos “Hoy”, “Mañana”, “En una semana”. */
  presets?: boolean;
  /** Permite vaciar la fecha con un botón. */
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}

const ISO = "yyyy-MM-dd";

const parse = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : undefined;
};

/**
 * Campo de fecha del panel: reemplaza los `<input type="date">` nativos, cuyo
 * calendario en escritorio solo se abre desde el icono. Aquí el campo entero
 * abre el calendario en español, con atajos, y sirve tanto controlado
 * (`value`/`onChange`) como dentro de un formulario nativo (`name`).
 */
export function DateField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "Elige una fecha",
  min,
  max,
  required,
  disabled,
  presets = true,
  clearable = false,
  className,
  "aria-label": ariaLabel,
}: DateFieldProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<string>(defaultValue ?? "");
  const [open, setOpen] = React.useState(false);
  const current = isControlled ? (value ?? "") : internal;
  const date = parse(current);
  const minDate = parse(min);
  const maxDate = parse(max);

  const commit = (next: Date | undefined) => {
    const iso = next ? format(next, ISO) : "";
    if (!isControlled) setInternal(iso);
    onChange?.(iso);
    setOpen(false);
  };

  const shortcuts = React.useMemo(
    () => [
      { label: "Hoy", value: new Date() },
      { label: "Mañana", value: addDays(new Date(), 1) },
      { label: "En una semana", value: addDays(new Date(), 7) },
    ],
    [],
  );

  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <div className={cn("relative min-w-0", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-required={required || undefined}
            className={cn(
              "w-full justify-between bg-white px-3 font-normal",
              !date && "text-muted-foreground",
              clearable && date && "pr-10",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left">
              {date
                ? format(date, "d 'de' MMMM 'de' yyyy", { locale: es })
                : placeholder}
            </span>
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {presets && (
            <div className="flex flex-wrap gap-1 border-b p-2">
              {shortcuts
                .filter(
                  (s) =>
                    (!minDate || s.value >= minDate) &&
                    (!maxDate || s.value <= maxDate),
                )
                .map((s) => (
                  <Button
                    key={s.label}
                    size="xs"
                    variant="secondary"
                    onClick={() => commit(s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
            </div>
          )}
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date ?? minDate}
            onSelect={commit}
            disabled={disabledDays}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {clearable && date && !disabled && (
        <button
          type="button"
          aria-label="Quitar fecha"
          onClick={() => commit(undefined)}
          className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );
}
