"use client";

import { Tag } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFilterState } from "@/providers/filter-state-provider";

/** Fila «Solo ofertas» de la barra lateral y de la hoja de filtros. */
export const OnSaleFilter = () => {
  const { filters, setFilter } = useFilterState();

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-1">
      <Label
        htmlFor="on-sale-filter"
        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 font-sans text-[15px] font-semibold leading-none text-blue-yankees"
      >
        <Tag aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-rose-700" />
        Solo ofertas
      </Label>
      <Switch
        id="on-sale-filter"
        aria-label="Mostrar solo ofertas"
        checked={filters.isOnSale}
        onCheckedChange={(checked) => setFilter("isOnSale", checked)}
      />
    </div>
  );
};
