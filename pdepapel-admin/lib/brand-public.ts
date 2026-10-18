import { placeLinesAfterParents } from "@/lib/brand-rules";
import prismadb from "@/lib/prismadb";

const PUBLIC_BRAND_PAGE_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  logoHasBackground: true,
  logoPermission: true,
  color: true,
  seoText: true,
  isFeatured: true,
  sortOrder: true,
} as const;

export interface PublicBrandSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  logoHasBackground: boolean;
  logoPermission: "UNKNOWN" | "ALLOWED" | "PENDING" | "DENIED";
  color: string | null;
  seoText: string | null;
  isFeatured: boolean;
  sortOrder: number;
  /** Productos activos (no archivados) de la marca, más los de sus líneas. */
  productCount: number;
  /** Si es una línea, su marca madre (solo si se muestra en la tienda). */
  parent: { name: string; slug: string } | null;
}

export interface PublicBrandLine {
  name: string;
  slug: string;
  logoUrl: string | null;
  logoPermission: PublicBrandSummary["logoPermission"];
  productCount: number;
}

/** Línea → madre de las líneas sin archivar de la tienda. */
async function lineParents(storeId: string) {
  const lines = await prismadb.brand.findMany({
    where: { storeId, parentBrandId: { not: null }, isArchived: false },
    select: { id: true, parentBrandId: true },
  });
  return new Map(lines.map((line) => [line.id, line.parentBrandId as string]));
}

/** Productos activos por marca; la madre suma los de sus líneas. */
async function activeProductCounts(storeId: string) {
  const [rows, parents] = await Promise.all([
    prismadb.product.groupBy({
      by: ["brandId"],
      where: { storeId, isArchived: false, brandId: { not: null } },
      _count: { _all: true },
    }),
    lineParents(storeId),
  ]);
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.brandId) continue;
    counts.set(row.brandId, (counts.get(row.brandId) ?? 0) + row._count._all);
    const parent = parents.get(row.brandId);
    if (parent) counts.set(parent, (counts.get(parent) ?? 0) + row._count._all);
  }
  return counts;
}

const PARENT_SELECT = { parent: { select: { name: true, slug: true, isVisible: true, isArchived: true } } } as const;

function publicParent(parent: { name: string; slug: string; isVisible: boolean; isArchived: boolean } | null) {
  return parent && parent.isVisible && !parent.isArchived ? { name: parent.name, slug: parent.slug } : null;
}

/** Marcas que se muestran en la tienda (visibles y sin archivar), en el orden del panel. */
export async function listPublicBrands(storeId: string, options: { withProducts?: boolean } = {}) {
  const [brands, counts] = await Promise.all([
    prismadb.brand.findMany({
      where: { storeId, isVisible: true, isArchived: false },
      select: { ...PUBLIC_BRAND_PAGE_SELECT, ...PARENT_SELECT, parentBrandId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    activeProductCounts(storeId),
  ]);
  const rows: PublicBrandSummary[] = placeLinesAfterParents(brands).map(({ parent, parentBrandId: _parentBrandId, ...brand }) => ({
    ...brand,
    productCount: counts.get(brand.id) ?? 0,
    parent: publicParent(parent),
  }));
  return options.withProducts ? rows.filter((brand) => brand.productCount > 0) : rows;
}

export type PublicBrandLookup =
  | {
      kind: "brand";
      brand: PublicBrandSummary & {
        categories: { id: string; name: string; slug: string; count: number }[];
        /** Líneas públicas con productos, para los chips de la página de la madre. */
        lines: PublicBrandLine[];
      };
    }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

/**
 * Una marca por slug para /marcas/[slug]. Una dirección anterior (cambio de
 * dirección o fusión) devuelve la actual para redirigir; oculta o archivada
 * no existe para la tienda.
 */
export async function findPublicBrand(storeId: string, slug: string): Promise<PublicBrandLookup> {
  const found = await prismadb.brand.findFirst({
    where: { storeId, slug, isVisible: true, isArchived: false },
    select: {
      ...PUBLIC_BRAND_PAGE_SELECT,
      ...PARENT_SELECT,
      lines: {
        where: { isArchived: false },
        select: { id: true, name: true, slug: true, logoUrl: true, logoPermission: true, isVisible: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });
  if (!found) {
    const redirect = await prismadb.brandSlugRedirect.findFirst({
      where: { storeId, oldSlug: slug, brand: { isVisible: true, isArchived: false } },
      select: { brand: { select: { slug: true } } },
    });
    return redirect ? { kind: "redirect", slug: redirect.brand.slug } : { kind: "missing" };
  }
  const { parent, lines, ...brand } = found;
  // La página de la madre lista también los productos de sus líneas (aunque la línea esté oculta).
  const familyIds = [brand.id, ...lines.map((line) => line.id)];
  const [counts, categoryRows] = await Promise.all([
    activeProductCounts(storeId),
    prismadb.product.groupBy({
      by: ["categoryId"],
      where: { storeId, brandId: { in: familyIds }, isArchived: false },
      _count: { _all: true },
    }),
  ]);
  const categories = categoryRows.length
    ? await prismadb.category.findMany({
        where: { storeId, id: { in: categoryRows.map((row) => row.categoryId) } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const countByCategory = new Map(categoryRows.map((row) => [row.categoryId, row._count._all]));
  return {
    kind: "brand",
    brand: {
      ...brand,
      productCount: counts.get(brand.id) ?? 0,
      parent: publicParent(parent),
      lines: lines
        .filter((line) => line.isVisible && (counts.get(line.id) ?? 0) > 0)
        .map((line) => ({
          name: line.name,
          slug: line.slug,
          logoUrl: line.logoUrl,
          logoPermission: line.logoPermission,
          productCount: counts.get(line.id) ?? 0,
        })),
      categories: categories
        .map((category) => ({ ...category, count: countByCategory.get(category.id) ?? 0 }))
        .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, "es")),
    },
  };
}
