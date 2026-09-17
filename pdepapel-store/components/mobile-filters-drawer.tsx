"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { FilterGroups, FilterGroupsProps } from "@/components/shop/filter-groups";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useFilterCount } from "@/hooks/use-filter-count";
import { ProductFilters, useProductFilters } from "@/hooks/use-product-filters";
import { countActiveFilters, EMPTY_FILTERS } from "@/lib/shop-filters";
import { createPendingFilterState, FilterStateProvider } from "@/providers/filter-state-provider";

export interface MobileFiltersDrawerProps extends FilterGroupsProps {
  fixedCategoryId?: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

const PENDING_IGNORE: (keyof ProductFilters)[] = ["search"];

/**
 * El cuerpo de la hoja de filtros. Vive aparte del botón porque es lo pesado
 * —los grupos de filtros, el contador en vivo y la hoja de vaul— y sólo hace
 * falta cuando alguien abre los filtros. El botón se sirve desde el servidor.
 */
const MobileFiltersDrawer: React.FC<MobileFiltersDrawerProps> = ({
  fixedCategoryId,
  open,
  onOpenChange,
  ...groups
}) => {
  const { filters, setFilters } = useProductFilters();
  const [pending, setPending] = useState<ProductFilters>(filters);

  const ignore = useMemo<(keyof ProductFilters)[]>(
    () => (fixedCategoryId ? [...PENDING_IGNORE, "categoryId", "typeId"] : PENDING_IGNORE),
    [fixedCategoryId],
  );
  const pendingCount = countActiveFilters(pending, ignore);
  const count = useFilterCount(pending, fixedCategoryId, open);
  const queryClient = useQueryClient();
  const pendingState = useMemo(() => createPendingFilterState(pending, setPending), [pending]);

  const handleOpenChange = (next: boolean) => {
    if (next) setPending(filters);
    onOpenChange(next);
  };

  const apply = async () => {
    onOpenChange(false);
    // Server actions run one at a time and, in Next 14.2, a products request
    // fired while the live count is still in flight can be dropped, leaving
    // the catalog dimmed forever. Let the count settle first (bounded wait).
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (queryClient.isFetching({ queryKey: ["products-count"] }) === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    setFilters({ ...pending, page: 1 });
  };

  const clearAll = () => {
    setPending({ ...EMPTY_FILTERS, search: pending.search, sortOption: pending.sortOption });
  };

  const total = count.data ?? null;
  const applyLabel =
    total === null
      ? "Ver productos"
      : total === 0
        ? "Sin productos con estos filtros"
        : `Ver ${total.toLocaleString("es-CO")} ${total === 1 ? "producto" : "productos"}`;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} shouldScaleBackground={false}>
      <DrawerContent aria-label="Filtros de productos" className="max-h-[88dvh] rounded-t-3xl border-0 bg-white">
        <DrawerTitle className="sr-only">Filtros de productos</DrawerTitle>
        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-2">
          <span className="inline-flex items-center gap-2 font-sans text-xl font-bold text-blue-yankees">
            <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />
            Filtros
          </span>
          <div className="flex items-center gap-1">
            {pendingCount > 0 && (
              <button type="button" onClick={clearAll} className="px-2 font-sans text-sm font-semibold text-rose-700">
                Limpiar todo
              </button>
            )}
            <DrawerClose
              aria-label="Cerrar"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </DrawerClose>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <FilterStateProvider value={pendingState}>
            <FilterGroups {...groups} />
          </FilterStateProvider>
        </div>
        <div className="shrink-0 border-t border-border bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={apply}
            disabled={total === 0}
            aria-busy={count.isFetching}
            className="flex h-13 min-h-[52px] w-full items-center justify-center rounded-full bg-blue-yankees font-sans text-base font-bold text-white transition-opacity disabled:opacity-50"
          >
            {applyLabel}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileFiltersDrawer;
