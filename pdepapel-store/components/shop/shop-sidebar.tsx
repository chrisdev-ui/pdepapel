"use client";

import { SlidersHorizontal } from "lucide-react";

import { FilterGroups, FilterGroupsProps } from "@/components/shop/filter-groups";

interface ShopSidebarProps extends FilterGroupsProps {
  activeCount: number;
  onClearAll: () => void;
}

/** Barra lateral de filtros en escritorio; pegajosa bajo la cabecera. */
export function ShopSidebar({ activeCount, onClearAll, ...groups }: ShopSidebarProps) {
  return (
    <aside
      aria-label="Filtros"
      className="hidden lg:sticky lg:top-[calc(var(--storefront-header-offset)+16px)] lg:block lg:max-h-[calc(100dvh-var(--storefront-header-offset)-32px)] lg:overflow-y-auto lg:overscroll-contain lg:pr-2"
    >
      <div className="flex h-10 items-center justify-between">
        <span className="inline-flex items-center gap-2 font-sans text-[17px] font-bold text-blue-yankees">
          <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />
          Filtros
        </span>
        {activeCount > 0 && (
          <button type="button" onClick={onClearAll} className="font-sans text-[13px] font-semibold text-rose-700 hover:underline">
            Limpiar todo
          </button>
        )}
      </div>
      <FilterGroups {...groups} />
    </aside>
  );
}
