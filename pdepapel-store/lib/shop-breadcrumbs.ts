import type { BreadcrumbItem } from "@/components/ui/breadcrumb";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { categoryPath, STOREFRONT_ROUTES, typePath } from "@/lib/routes";

type Named = { id: string; name: string; slug?: string | null };
type NamedCategory = Named & { typeId?: string | null };

const findBy = <T extends Named>(items: T[], value: string) => items.find((item) => item.id === value || item.slug === value);

/**
 * Migas de /tienda a partir de los filtros vigentes (también los que cambian en el navegador).
 * Una subcategoría filtrada no es su página: la miga lleva a `/categoria/{slug}`.
 */
export function buildShopBreadcrumbs(
  filters: { typeId: string[]; categoryId: string[]; search: string | null },
  types: Named[],
  categories: NamedCategory[],
): BreadcrumbItem[] {
  const shop = { label: "Tienda", href: STOREFRONT_ROUTES.shop, isCurrent: false };
  if (filters.categoryId.length === 1) {
    const category = findBy(categories, filters.categoryId[0]);
    if (category) {
      const type = category.typeId ? types.find((item) => item.id === category.typeId) : undefined;
      return [
        shop,
        ...(type ? [{ label: stripTaxonomyIcon(type.name), href: typePath(type), isCurrent: false }] : []),
        { label: stripTaxonomyIcon(category.name), href: categoryPath(category.slug || category.id), isCurrent: false },
      ];
    }
  }
  const type = filters.categoryId.length === 0 && filters.typeId.length === 1 ? findBy(types, filters.typeId[0]) : undefined;
  const label = type ? stripTaxonomyIcon(type.name) : filters.search ? `Resultados: ${filters.search}` : null;
  if (!label) return [{ ...shop, isCurrent: true }];
  return [shop, { label, isCurrent: true }];
}

/** Migas de /categoria/{slug}: el tipo lleva a la tienda filtrada por él. */
export function buildCategoryBreadcrumbs(category: { name: string }, type: Named | undefined): BreadcrumbItem[] {
  return [
    { label: "Tienda", href: STOREFRONT_ROUTES.shop, isCurrent: false },
    ...(type ? [{ label: stripTaxonomyIcon(type.name), href: typePath(type), isCurrent: false }] : []),
    { label: stripTaxonomyIcon(category.name), isCurrent: true },
  ];
}
