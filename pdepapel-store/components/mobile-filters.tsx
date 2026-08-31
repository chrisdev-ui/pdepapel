"use client";

import { Plus } from "lucide-react";

import Filter from "@/components/filter";
import PriceFilter from "@/components/price-filter";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CatalogOption, Category, Color, Design, Type } from "@/types";

interface MobileFiltersProps {
  types: Type[];
  categories: Category[];
  catalogOptions: CatalogOption[];
  colors: Color[];
  designs: Design[];
  hideCategoryFilters?: boolean;
}

const MobileFilters: React.FC<MobileFiltersProps> = ({
  types,
  categories,
  catalogOptions,
  colors,
  designs,
  hideCategoryFilters = false,
}) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="flex h-11 items-center gap-x-2 lg:hidden">
          Filtros
          <Plus aria-hidden="true" className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        variant="default"
        className="max-h-screen overflow-y-auto overscroll-contain lg:hidden"
      >
        <SheetTitle className="sr-only">Filtros de productos</SheetTitle>
        <div className="p-4">
          {!hideCategoryFilters && (
            <>
              <Filter
                valueKey="typeId"
                name="Categorías"
                data={types}
                emptyMessage="No hay tipos disponibles"
              />
              <Filter
                valueKey="categoryId"
                name="Sub-Categorías"
                emptyMessage="No hay categorías disponibles"
                data={categories}
              />
            </>
          )}
          {catalogOptions.map((option) => (
            <Filter
              key={option.id}
              valueKey="optionValueId"
              name={option.name}
              emptyMessage={`No hay valores de ${option.name.toLocaleLowerCase("es-CO")} disponibles`}
              data={option.values}
            />
          ))}
          {colors.length > 0 && (
            <Filter
              valueKey="colorId"
              name="Colores"
              emptyMessage="No hay colores disponibles"
              data={colors}
            />
          )}
          {designs.length > 0 && (
            <Filter
              valueKey="designId"
              name="Diseños"
              emptyMessage="No hay diseños disponibles"
              data={designs}
            />
          )}
          <PriceFilter min={0} max={1000000} step={1000} />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileFilters;
