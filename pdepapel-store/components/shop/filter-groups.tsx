"use client";

import Filter from "@/components/filter";
import { OnSaleFilter } from "@/components/on-sale-filter";
import PriceFilter from "@/components/price-filter";
import type { FilterType, NavigationCategory } from "@/lib/catalog-navigation";
import { CatalogOption, Color, Design } from "@/types";

export interface BrandFilterItem {
  /** Slug de la marca. */
  id: string;
  name: string;
  count?: number;
  logoUrl?: string | null;
}

export interface FilterGroupsProps {
  types: (FilterType & { count?: number })[];
  categories: (NavigationCategory & { count?: number })[];
  catalogOptions: CatalogOption[];
  colors: (Color & { count?: number })[];
  designs: (Design & { count?: number })[];
  /** Marcas con productos para los demás filtros, en el orden del panel. */
  brands?: BrandFilterItem[];
  hideCategoryFilters?: boolean;
}

/** Las facetas en el orden acordado; las usan la barra lateral y la hoja móvil. */
export function FilterGroups({ types, categories, catalogOptions, colors, designs, brands = [], hideCategoryFilters = false }: FilterGroupsProps) {
  return (
    <>
      <OnSaleFilter />
      {!hideCategoryFilters && <Filter valueKey="typeId" name="Categorías" data={types} emptyMessage="No hay tipos disponibles" />}
      {!hideCategoryFilters && (
        <Filter valueKey="categoryId" name="Subcategorías" data={categories} emptyMessage="No hay categorías disponibles" defaultOpen={false} />
      )}
      {brands.length > 0 && <Filter valueKey="marca" name="Marca" data={brands} emptyMessage="No hay marcas disponibles" keepOrder />}
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
