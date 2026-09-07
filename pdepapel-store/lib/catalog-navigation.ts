import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { Category, Product, Type } from "@/types";

export interface NavigationType extends Type {
  /** Clean label without any leading emoji. */
  label: string;
  /** Subcategories of this type, sorted by name. */
  subcategories: Category[];
}

export interface FeaturedTile {
  id: string;
  slug?: string;
  name: string;
  price: number;
  imageUrl: string;
}

export type FeaturedByType = Record<string, FeaturedTile>;

const collator = new Intl.Collator("es-CO", { sensitivity: "base" });

/**
 * Merchandising order for the header: the types shoppers look for first.
 * Unknown types follow, alphabetically. Matched on slug or clean name.
 */
export const NAVIGATION_PRIORITY = [
  "cuadernos",
  "escritura",
  "lapices",
  "journal",
  "planeacion",
  "utiles",
  "kits",
  "accesorios",
  "bolsos",
  "carpetas",
  "oficina",
  "lectura",
  "creatividad",
  "belleza",
];

function priorityIndex(type: { slug?: string | null; label: string }) {
  const haystack = `${type.slug ?? ""} ${type.label}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const index = NAVIGATION_PRIORITY.findIndex((keyword) =>
    haystack.includes(keyword),
  );
  return index === -1 ? NAVIGATION_PRIORITY.length : index;
}

/**
 * Types with their subcategories in merchandising order (see
 * NAVIGATION_PRIORITY), ties broken alphabetically.
 */
export function buildNavigationTypes(
  types: Type[],
  categories: Category[],
): NavigationType[] {
  const byType = new Map<string, Category[]>();
  for (const category of categories) {
    const list = byType.get(category.typeId) ?? [];
    list.push(category);
    byType.set(category.typeId, list);
  }

  return types
    .map((type) => ({
      ...type,
      label: stripTaxonomyIcon(type.name),
      subcategories: [...(byType.get(type.id) ?? [])].sort((a, b) =>
        collator.compare(stripTaxonomyIcon(a.name), stripTaxonomyIcon(b.name)),
      ),
    }))
    .filter((type) => type.label.length > 0)
    .sort(
      (a, b) =>
        priorityIndex(a) - priorityIndex(b) || collator.compare(a.label, b.label),
    );
}

/**
 * One featured, in-stock product with a photo per type, for the mega menu
 * tile. The admin's "destacado" flag decides; without a photo there is no tile.
 */
export function buildFeaturedByType(products: Product[]): FeaturedByType {
  const result: FeaturedByType = {};
  for (const product of products) {
    const typeId = product.category?.typeId;
    const imageUrl = product.images?.[0]?.url;
    if (!typeId || !imageUrl || !product.isFeatured || product.stock <= 0) {
      continue;
    }
    if (result[typeId]) continue;
    result[typeId] = {
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: Number(product.price),
      imageUrl,
    };
  }
  return result;
}
