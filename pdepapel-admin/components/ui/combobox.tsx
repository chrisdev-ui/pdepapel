"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import * as React from "react";

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  /** Palabras extra que también deben coincidir al buscar (SKU, alias…). */
  keywords?: string[];
  disabled?: boolean;
  /** Elemento a la izquierda de la etiqueta (muestra de color, icono). */
  icon?: React.ReactNode;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Si se define, la lista ofrece “Crear «texto»” cuando no hay coincidencias. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  "aria-label"?: string;
}

/**
 * Selector con búsqueda para listas largas (proveedores, categorías, clientes).
 * Usa Command (cmdk), teclado completo y opción de crear desde la búsqueda.
 * Para listas de hasta 8 opciones sigue bastando `Select`.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin coincidencias.",
  disabled,
  id,
  className,
  onCreate,
  createLabel = (q) => `Crear “${q}”`,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value) ?? null;

  const select = (option: ComboboxOption) => {
    onChange(option.value === value ? null : option.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "w-full justify-between bg-white px-3 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {selected?.icon}
            <span className="min-w-0 flex-1 truncate">
              {selected ? selected.label : placeholder}
            </span>
          </span>
          <ChevronsUpDown
            className="h-4 w-4 shrink-0 opacity-50"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {onCreate && query.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    onCreate(query.trim());
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {createLabel(query.trim())}
                </button>
              ) : (
                emptyText
              )}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={[option.label, ...(option.keywords ?? [])].join(" ")}
                  disabled={option.disabled}
                  onSelect={() => select(option)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  {option.icon}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
