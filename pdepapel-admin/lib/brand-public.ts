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
  /** Productos activos (no archivados) de la marca. */
  productCount: number;
}

async function activeProductCounts(storeId: string, brandIds?: string[]) {
  const rows = await prismadb.product.groupBy({
    by: ["brandId"],
    where: { storeId, isArchived: false, brandId: brandIds ? { in: brandIds } : { not: null } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.brandId ?? "", row._count._all]));
}

/** Marcas que se muestran en la tienda (visibles y sin archivar), en el orden del panel. */
export async function listPublicBrands(storeId: string, options: { withProducts?: boolean } = {}) {
  const brands = await prismadb.brand.findMany({
    where: { storeId, isVisible: true, isArchived: false },
    select: PUBLIC_BRAND_PAGE_SELECT,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const counts = await activeProductCounts(storeId, brands.map((brand) => brand.id));
  const rows: PublicBrandSummary[] = brands.map((brand) => ({ ...brand, productCount: counts.get(brand.id) ?? 0 }));
  return options.withProducts ? rows.filter((brand) => brand.productCount > 0) : rows;
}

export type PublicBrandLookup =
  | { kind: "brand"; brand: PublicBrandSummary & { categories: { id: string; name: string; slug: string; count: number }[] } }
  | { kind: "redirect"; slug: string }
  | { kind: "missing" };

/**
 * Una marca por slug para /marcas/[slug]. Una dirección anterior (cambio de
 * dirección o fusión) devuelve la actual para redirigir; oculta o archivada
 * no existe para la tienda.
 */
export async function findPublicBrand(storeId: string, slug: string): Promise<PublicBrandLookup> {
  const brand = await prismadb.brand.findFirst({
    where: { storeId, slug, isVisible: true, isArchived: false },
    select: PUBLIC_BRAND_PAGE_SELECT,
  });
  if (!brand) {
    const redirect = await prismadb.brandSlugRedirect.findFirst({
      where: { storeId, oldSlug: slug, brand: { isVisible: true, isArchived: false } },
      select: { brand: { select: { slug: true } } },
    });
    return redirect ? { kind: "redirect", slug: redirect.brand.slug } : { kind: "missing" };
  }
  const [counts, categoryRows] = await Promise.all([
    activeProductCounts(storeId, [brand.id]),
    prismadb.product.groupBy({
      by: ["categoryId"],
      where: { storeId, brandId: brand.id, isArchived: false },
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
      categories: categories
        .map((category) => ({ ...category, count: countByCategory.get(category.id) ?? 0 }))
        .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, "es")),
    },
  };
}
