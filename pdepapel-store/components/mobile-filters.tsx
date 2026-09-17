"use client";

import { SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { FilterGroupsProps } from "@/components/shop/filter-groups";
import { ProductFilters, useProductFilters } from "@/hooks/use-product-filters";
import { countActiveFilters } from "@/lib/shop-filters";
import { cn } from "@/lib/utils";

interface MobileFiltersProps extends FilterGroupsProps {
  fixedCategoryId?: string;
  className?: string;
}

const PENDING_IGNORE: (keyof ProductFilters)[] = ["search"];

/**
 * La hoja se pide sólo cuando alguien abre los filtros. Antes el botón entero
 * colgaba de este import: el chunk se pedía al hidratar, justo cuando las
 * imágenes de la cuadrícula tienen la conexión ocupada, y el botón real
 * tardaba unos once segundos en aparecer en un móvil con 4G lenta.
 */
const MobileFiltersDrawer = dynamic(() => import("@/components/mobile-filters-drawer"), {
  ssr: false,
});

/**
 * Botón de filtros para teléfono y tableta. Se renderiza en el servidor, así
 * que se ve y se anuncia desde el primer pintado; queda deshabilitado hasta
 * que hidrata, porque hasta entonces no puede abrir nada de verdad.
 */
const MobileFilters: React.FC<MobileFiltersProps> = ({ fixedCategoryId, className, ...groups }) => {
  const { filters } = useProductFilters();
  const [open, setOpen] = useState(false);
  /** Una vez abierto, la hoja se queda montada para no volver a pedir el chunk. */
  const [everOpened, setEverOpened] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const ignore = fixedCategoryId ? [...PENDING_IGNORE, "categoryId", "typeId"] : PENDING_IGNORE;
  const appliedCount = countActiveFilters(filters, ignore as (keyof ProductFilters)[]);

  const openDrawer = () => {
    setEverOpened(true);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Filtros"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!ready}
        onClick={openDrawer}
        className={cn(
          "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] border-blue-yankees bg-white px-4 font-sans text-[15px] font-semibold text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:border-blue-yankees/30 disabled:text-blue-yankees/50",
          className,
        )}
      >
        <SlidersHorizontal aria-hidden="true" className="h-[18px] w-[18px]" />
        Filtros
        {appliedCount > 0 && (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-yankees px-1.5 text-xs font-bold text-white"
          >
            {appliedCount}
          </span>
        )}
      </button>
      {everOpened && (
        <MobileFiltersDrawer
          {...groups}
          fixedCategoryId={fixedCategoryId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
};

export default MobileFilters;
