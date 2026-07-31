"use client";

import { Plus } from "lucide-react";

import Filter from "@/components/filter";
import PriceFilter from "@/components/price-filter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Category, Color, Design, Size, Type } from "@/types";

interface MobileFiltersProps {
  types: Type[];
  categories: Category[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  hideCategoryFilters?: boolean;
}

const MobileFilters: React.FC<MobileFiltersProps> = ({
  types,
  categories,
  sizes,
  colors,
  designs,
  hideCategoryFilters = false,
}) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="flex items-center gap-x-2 lg:hidden">
          Filtros
          <Plus className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="max-h-screen overflow-y-auto lg:hidden">
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
          {sizes.length > 0 && (
            <Filter
              valueKey="sizeId"
              name="Tamaños"
              emptyMessage="No hay tamaños disponibles"
              data={sizes}
            />
          )}
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
