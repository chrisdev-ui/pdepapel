"use client";

import { Plus } from "lucide-react";

import Filter from "@/components/filter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Category, Color, Design, PriceRange, Size, Type } from "@/types";

interface MobileFiltersProps {
  types: Type[];
  categories: Category[];
  sizes: Size[];
  colors: Color[];
  designs: Design[];
  pricesRanges: PriceRange[];
}

const MobileFilters: React.FC<MobileFiltersProps> = ({
  types,
  categories,
  sizes,
  colors,
  designs,
  pricesRanges,
}) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="flex items-center gap-x-2 lg:hidden">
          Filtros
          <Plus className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="lg:hidden">
        <div className="p-4">
          <Filter
            valueKey="typeId"
            name="Tipos"
            data={types}
            emptyMessage="No hay tipos disponibles"
          />
          <Filter
            valueKey="categoryId"
            name="Categorías"
            emptyMessage="No hay categorías disponibles"
            data={categories}
          />
          <Filter
            valueKey="sizeId"
            name="Tamaños"
            emptyMessage="No hay tamaños disponibles"
            data={sizes}
          />
          <Filter
            valueKey="colorId"
            name="Colores"
            emptyMessage="No hay colores disponibles"
            data={colors}
          />
          <Filter
            valueKey="designId"
            name="Diseños"
            emptyMessage="No hay diseños disponibles"
            data={designs}
          />
          <Filter
            valueKey="priceRange"
            name="Precios"
            emptyMessage="No hay precios disponibles"
            data={pricesRanges}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileFilters;
