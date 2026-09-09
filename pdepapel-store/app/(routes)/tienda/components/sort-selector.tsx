"use client";

import { ArrowUpDown, Check } from "lucide-react";
import { useState } from "react";

import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SORT_OPTIONS, SortOptions } from "@/constants";
import { useProductFilters } from "@/hooks/use-product-filters";
import { cn } from "@/lib/utils";

type Option = { value: SortOptions; label: string };

interface SortSelectorProps {
  options?: Option[];
  isDisabled?: boolean;
  className?: string;
}

const DEFAULT_SORT = SortOptions.dateAdded;

function useSort(options: Option[]) {
  const { filters, setFilter } = useProductFilters();
  const current = (filters.sortOption as SortOptions) || DEFAULT_SORT;
  const label = options.find((option) => option.value === current)?.label ?? options[0]?.label ?? "";
  const change = (value: string) => setFilter("sortOption", value === DEFAULT_SORT ? null : value);
  return { current, label, change };
}

/** Escritorio: píldora «Ordenar: …» con el menú de Radix. */
const SortSelector: React.FC<SortSelectorProps> = ({ options = SORT_OPTIONS, isDisabled = false, className }) => {
  const { current, label, change } = useSort(options);

  return (
    <Select value={current} onValueChange={change} disabled={isDisabled}>
      <SelectTrigger
        aria-label="Ordenar productos"
        className={cn(
          "h-10 w-auto gap-2 rounded-full border-[1.5px] border-border bg-white px-4 font-sans text-sm font-semibold text-blue-yankees focus:ring-blue-yankees data-[placeholder]:text-blue-yankees",
          className,
        )}
      >
        <span className="font-medium text-muted-foreground">Ordenar:</span>
        <SelectValue placeholder={label}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="rounded-xl">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="rounded-lg font-sans">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** Teléfono y tableta: botón que abre una hoja inferior con la lista de opciones. */
export function SortSheet({ options = SORT_OPTIONS, className }: SortSelectorProps) {
  const { current, change } = useSort(options);
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Ordenar productos"
          className={cn(
            "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] border-border bg-white px-4 font-sans text-[15px] font-semibold text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2",
            className,
          )}
        >
          <ArrowUpDown aria-hidden="true" className="h-[18px] w-[18px]" />
          Ordenar
        </button>
      </DrawerTrigger>
      <DrawerContent aria-label="Ordenar productos" className="rounded-t-3xl border-0 bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <DrawerTitle className="flex items-center gap-2 px-5 pb-1 pt-2 font-sans text-xl font-bold text-blue-yankees">
          <ArrowUpDown aria-hidden="true" className="h-5 w-5" />
          Ordenar por
        </DrawerTitle>
        <div role="radiogroup" aria-label="Ordenar por" className="flex flex-col px-2">
          {options.map((option) => {
            const selected = option.value === current;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  change(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-[52px] items-center justify-between rounded-xl px-3 text-left font-sans text-base text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees",
                  selected ? "bg-kawaii-lavender-light font-bold" : "font-medium",
                )}
              >
                {option.label}
                {selected && <Check aria-hidden="true" className="h-5 w-5" />}
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default SortSelector;
