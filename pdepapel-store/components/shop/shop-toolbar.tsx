"use client";

import { X } from "lucide-react";
import { ReactNode } from "react";

import SortSelector, { SortSheet } from "@/app/(routes)/tienda/components/sort-selector";
import { ActiveFilterChip } from "@/lib/shop-filters";
import { cn } from "@/lib/utils";

interface ActiveFilterChipsProps {
  chips: ActiveFilterChip[];
  onRemove: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
  className?: string;
}

/** Fila de filtros aplicados: cada chip se quita con su ×; «Limpiar todo» al final. */
export function ActiveFilterChips({ chips, onRemove, onClearAll, className }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Filtros aplicados" className={cn("flex items-center gap-2", className)}>
      {chips.map((chip) => (
        <li key={`${chip.key}-${chip.value ?? ""}`} className="shrink-0">
          <button
            type="button"
            onClick={() => onRemove(chip)}
            aria-label={`Quitar filtro ${chip.label}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-kawaii-lavender-light pl-3 pr-2 font-sans text-[13px] font-semibold text-blue-yankees transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-1"
          >
            {chip.label}
            <span aria-hidden="true" className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-yankees/10">
              <X className="h-3 w-3" />
            </span>
          </button>
        </li>
      ))}
      <li className="shrink-0">
        <button type="button" onClick={onClearAll} className="px-1 font-sans text-[13px] font-semibold text-rose-700 hover:underline">
          Limpiar todo
        </button>
      </li>
    </ul>
  );
}

interface ShopToolbarProps {
  chips: ActiveFilterChip[];
  onRemoveChip: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
  rangeText: string;
  /** Campo de búsqueda dentro de la categoría (solo en categorías). */
  searchSlot?: ReactNode;
  /** Acción contextual, como guardar la búsqueda (solo con filtros activos). */
  actionSlot?: ReactNode;
}

/** Escritorio: chips o rango a la izquierda, búsqueda de categoría y orden a la derecha. */
export function ShopToolbar({ chips, onRemoveChip, onClearAll, rangeText, searchSlot, actionSlot }: ShopToolbarProps) {
  return (
    <div className="hidden min-h-11 items-center justify-between gap-4 lg:flex">
      <div className="min-w-0 flex-1">
        {chips.length > 0 ? (
          <ActiveFilterChips chips={chips} onRemove={onRemoveChip} onClearAll={onClearAll} className="flex-wrap" />
        ) : (
          <p className="font-sans text-sm font-medium text-muted-foreground" aria-live="polite">
            {rangeText}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {actionSlot}
        {searchSlot}
        <SortSelector />
      </div>
    </div>
  );
}

interface MobileToolbarProps {
  filtersSlot: ReactNode;
  chips: ActiveFilterChip[];
  onRemoveChip: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
  rangeText: string;
}

/** Teléfono y tableta: barra «Filtros / Ordenar» pegajosa bajo la cabecera, chips debajo. */
export function MobileToolbar({ filtersSlot, chips, onRemoveChip, onClearAll, rangeText }: MobileToolbarProps) {
  // Ambos bloques son hijos directos de la columna de resultados: así la barra
  // pegajosa acompaña toda la lista y no solo a su propio envoltorio.
  return (
    <>
      <div className="sticky top-[var(--storefront-header-scrolled-offset)] z-30 -mx-4 flex gap-2 border-b border-border bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        {filtersSlot}
        <SortSheet />
      </div>
      <div className="-mt-1 flex min-h-9 items-center lg:hidden">
        {chips.length > 0 ? (
          <ActiveFilterChips chips={chips} onRemove={onRemoveChip} onClearAll={onClearAll} className="category-chips -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6" />
        ) : (
          <p className="font-sans text-sm font-medium text-muted-foreground" aria-live="polite">
            {rangeText}
          </p>
        )}
      </div>
    </>
  );
}

