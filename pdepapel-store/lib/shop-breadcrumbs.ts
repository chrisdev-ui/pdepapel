import type { BreadcrumbItem } from "@/components/ui/breadcrumb";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { STOREFRONT_ROUTES } from "@/lib/routes";

type Named = { id: string; name: string; slug?: string | null };

const findBy = (items: Named[], value: string) => items.find((item) => item.id === value || item.slug === value);

/** Migas de /tienda a partir de los filtros vigentes (también los que cambian en el navegador). */
export function buildShopBreadcrumbs(
  filters: { typeId: string[]; categoryId: string[]; search: string | null },
  types: Named[],
  categories: Named[],
): BreadcrumbItem[] {
  const leaf =
    filters.categoryId.length === 1
      ? findBy(categories, filters.categoryId[0])
      : filters.categoryId.length === 0 && filters.typeId.length === 1
        ? findBy(types, filters.typeId[0])
        : undefined;
  const label = leaf ? stripTaxonomyIcon(leaf.name) : filters.search ? `Resultados: ${filters.search}` : null;
  if (!label) return [{ label: "Tienda", href: STOREFRONT_ROUTES.shop, isCurrent: true }];
  return [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop, isCurrent: false },
    { label, isCurrent: true },
  ];
}
