"use client";

import Filter from "@/components/filter";
import { OnSaleFilter } from "@/components/on-sale-filter";
import PriceFilter from "@/components/price-filter";
import { CatalogOption, Category, Color, Design, Type } from "@/types";

export interface FilterGroupsProps {
  types: Type[];
  categories: (Category & { count?: number })[];
  catalogOptions: CatalogOption[];
  colors: (Color & { count?: number })[];
  designs: (Design & { count?: number })[];
  hideCategoryFilters?: boolean;
}

/** Las facetas en el orden acordado; las usan la barra lateral y la hoja móvil. */
export function FilterGroups({ types, categories, catalogOptions, colors, designs, hideCategoryFilters = false }: FilterGroupsProps) {
  return (
    <>
      <OnSaleFilter />
      {!hideCategoryFilters && <Filter valueKey="typeId" name="Categorías" data={types} emptyMessage="No hay tipos disponibles" />}
      {!hideCategoryFilters && (
        <Filter valueKey="categoryId" name="Subcategorías" data={categories} emptyMessage="No hay categorías disponibles" defaultOpen={false} />
      )}
      <PriceFilter />
      {catalogOptions.map((option) => (
        <Filter
          key={option.id}
          valueKey="optionValueId"
          name={option.name}
          data={option.values}
          emptyMessage={`No hay valores de ${option.name.toLocaleLowerCase("es-CO")} disponibles`}
          defaultOpen={false}
        />
      ))}
      {colors.length > 0 && <Filter valueKey="colorId" name="Colores" data={colors} emptyMessage="No hay colores disponibles" defaultOpen={false} />}
      {designs.length > 0 && <Filter valueKey="designId" name="Diseños" data={designs} emptyMessage="No hay diseños disponibles" defaultOpen={false} />}
    </>
  );
}
