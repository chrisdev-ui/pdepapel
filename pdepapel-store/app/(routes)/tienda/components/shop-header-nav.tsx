"use client";

import { CategoryChips } from "@/components/category-chips";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useProductFilters } from "@/hooks/use-product-filters";
import { buildShopBreadcrumbs } from "@/lib/shop-breadcrumbs";
import type { Type } from "@/types";

type Named = { id: string; name: string; slug?: string | null };

interface ShopHeaderNavProps {
  navigationTypes: Pick<Type, "id" | "name" | "slug" | "icon" | "iconSvg">[];
  types: Named[];
  categories: Named[];
}

/**
 * Chips de tipo y migas de /tienda. Leen los filtros de la URL en vivo: al
 * filtrar en el navegador (sin recargar) se actualizan como en una carga directa.
 */
export function ShopHeaderNav({ navigationTypes, types, categories }: ShopHeaderNavProps) {
  const { filters } = useProductFilters();
  const typeIds = filters.typeId ?? [];
  const activeType = typeIds.length === 1 ? types.find((type) => type.id === typeIds[0] || type.slug === typeIds[0]) : undefined;
  const items = buildShopBreadcrumbs(
    { typeId: typeIds, categoryId: filters.categoryId ?? [], search: filters.search },
    types,
    categories,
  );
  return (
    <>
      <CategoryChips types={navigationTypes} className="-mx-4 sm:-mx-6" activeTypeId={activeType?.id} />
      <Breadcrumb items={items} />
    </>
  );
}
