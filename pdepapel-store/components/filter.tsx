"use client";

import { ChevronDown, Search } from "lucide-react";
import { ReactNode, useEffect, useId, useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { LIMIT } from "@/constants";
import { ProductFilters } from "@/hooks/use-product-filters";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { FilterListKey } from "@/lib/shop-filters";
import { TypeIcon } from "@/lib/type-icons";
import { cn } from "@/lib/utils";
import { useFilterState } from "@/providers/filter-state-provider";

interface FilterSectionProps {
  name: string;
  badge?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

const openStateKey = (name: string) => `pdp:filtro:${name}`;

/** Grupo plegable de la barra lateral y de la hoja móvil; recuerda si quedó abierto en la sesión. */
export function FilterSection({ name, badge = 0, defaultOpen = true, children, className }: FilterSectionProps) {
  const contentId = useId();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(openStateKey(name));
      if (stored !== null) setOpen(stored === "1");
    } catch {
      // Sin almacenamiento de sesión: se queda el valor por defecto.
    }
  }, [name]);

  const toggle = () => {
    setOpen((value) => {
      try {
        window.sessionStorage.setItem(openStateKey(name), value ? "0" : "1");
      } catch {
        // ignorar
      }
      return !value;
    });
  };

  return (
    <div className={cn("border-b border-border py-3", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={toggle}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left font-sans text-[15px] font-bold text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 lg:min-h-9"
      >
        <span className="inline-flex items-center gap-2">
          {name}
          {badge > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-shell px-1.5 font-sans text-xs font-bold text-blue-yankees">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown aria-hidden="true" className={cn("h-[18px] w-[18px] text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div id={contentId} hidden={!open} className="pt-1">
        {children}
      </div>
    </div>
  );
}

interface FilterItem {
  id: string;
  name: string;
  value?: string;
  count?: number;
  icon?: string | null;
  slug?: string;
}

interface FilterProps {
  valueKey: FilterListKey;
  name: string;
  emptyMessage?: string;
  data: FilterItem[];
  defaultOpen?: boolean;
}

const SEARCH_FROM = 8;

/** Lista de casillas de una faceta: iconos Lucide para tipos, muestra de color, conteo a la derecha. */
const Filter: React.FC<FilterProps> = ({ valueKey, name, data, emptyMessage, defaultOpen = true }) => {
  const filterInstanceId = useId();
  const { filters, toggleFilter, setFilter } = useFilterState();
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selected = useMemo(() => {
    const values = filters[valueKey as keyof ProductFilters];
    return Array.isArray(values) ? values : [];
  }, [filters, valueKey]);
  const visibleIds = useMemo(() => new Set(data.map((item) => item.id)), [data]);

  const sorted = useMemo(() => [...data].sort((a, b) => stripTaxonomyIcon(a.name).localeCompare(stripTaxonomyIcon(b.name), "es")), [data]);
  const filtered = useMemo(() => {
    if (!searchQuery) return sorted;
    const needle = searchQuery.toLocaleLowerCase("es-CO");
    return sorted.filter((item) => stripTaxonomyIcon(item.name).toLocaleLowerCase("es-CO").includes(needle));
  }, [sorted, searchQuery]);
  const visible = showAll || searchQuery ? filtered : filtered.slice(0, LIMIT);
  const hiddenCount = filtered.length - LIMIT;

  const activeCount = selected.filter((id) => visibleIds.has(id)).length;

  const handleToggle = (id: string) => {
    trackCustomerEvent("catalog_filter", { filter: valueKey, action: selected.includes(id) ? "remove" : "add" });
    toggleFilter(valueKey, id);
  };

  const clearGroup = () => {
    const remaining = selected.filter((id) => !visibleIds.has(id));
    setFilter(valueKey, remaining.length > 0 ? remaining : null);
  };

  return (
    <FilterSection name={name} badge={activeCount} defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-1">
        {sorted.length > SEARCH_FROM && (
          <label className="relative mb-1 block">
            <span className="sr-only">Buscar en {name}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={`Buscar ${name.toLocaleLowerCase("es-CO")}…`}
              className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 font-sans text-sm text-blue-yankees placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-yankees"
            />
          </label>
        )}
        {activeCount > 0 && (
          <button type="button" onClick={clearGroup} className="self-end font-sans text-xs font-semibold text-rose-700 hover:underline">
            Limpiar
          </button>
        )}
        {filtered.length === 0 && (
          <p className="py-1 font-sans text-sm text-muted-foreground">{searchQuery ? "No se encontraron resultados" : emptyMessage}</p>
        )}
        {visible.map((item) => {
          const inputId = `${filterInstanceId}-${valueKey}-${item.id}`;
          const checked = selected.includes(item.id);
          const label = stripTaxonomyIcon(item.name);
          const dimmed = item.count === 0 && !checked;
          return (
            <div key={item.id} className={cn("flex min-h-10 items-center gap-2.5 lg:min-h-9", dimmed && "opacity-60")}>
              <Checkbox
                id={inputId}
                checked={checked}
                onCheckedChange={() => handleToggle(item.id)}
                className="h-[18px] w-[18px] rounded-[5px] border-[1.5px] border-blue-baby data-[state=checked]:border-blue-yankees data-[state=checked]:bg-blue-yankees data-[state=checked]:text-white"
              />
              {valueKey === "colorId" && item.value && (
                <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full border border-blue-yankees/25" style={{ backgroundColor: item.value }} />
              )}
              {valueKey === "typeId" && <TypeIcon type={item} className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />}
              <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer truncate font-sans text-sm font-medium text-blue-yankees">
                {label}
              </label>
              {item.count !== undefined && <span className="shrink-0 font-sans text-[13px] text-muted-foreground">{item.count}</span>}
            </div>
          );
        })}
        {!searchQuery && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="mt-1 inline-flex w-fit items-center gap-1 font-sans text-[13px] font-semibold text-rose-700 hover:underline"
          >
            {showAll ? "Ver menos" : `Ver ${hiddenCount} más`}
            <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5", showAll && "rotate-180")} />
          </button>
        )}
      </div>
    </FilterSection>
  );
};

export default Filter;
