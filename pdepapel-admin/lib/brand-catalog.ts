import prismadb from "@/lib/prismadb";

/** Parámetro del catálogo de la tienda: `?marca=kiut,norma`. */
export const BRAND_FILTER_PARAM = "marca";
const MAX_BRAND_SLUGS = 20;

export function parseBrandSlugsParam(value: string | null | undefined): string[] {
  if (!value) return [];
  const slugs = value
    .split(",")
    .map((slug) => slug.trim().toLowerCase())
    .filter((slug) => /^[a-z0-9-]{1,140}$/.test(slug));
  return Array.from(new Set(slugs)).sort().slice(0, MAX_BRAND_SLUGS);
}

/**
 * Ids de las marcas públicas pedidas por slug actual o por una dirección
 * anterior, más las líneas (sin archivar, aunque estén ocultas) de cada una:
 * elegir Primavera trae también Flower Power; elegir la línea, solo la línea.
 */
export async function resolvePublicBrandIds(storeId: string, slugs: string[]) {
  if (slugs.length === 0) return [];
  const [direct, redirects] = await Promise.all([
    prismadb.brand.findMany({
      where: { storeId, slug: { in: slugs }, isVisible: true, isArchived: false },
      select: { id: true },
    }),
    prismadb.brandSlugRedirect.findMany({
      where: { storeId, oldSlug: { in: slugs }, brand: { isVisible: true, isArchived: false } },
      select: { brandId: true },
    }),
  ]);
  const ids = Array.from(new Set([...direct.map((brand) => brand.id), ...redirects.map((row) => row.brandId)]));
  if (ids.length === 0) return ids;
  const lines = await prismadb.brand.findMany({
    where: { storeId, parentBrandId: { in: ids }, isArchived: false },
    select: { id: true },
  });
  return Array.from(new Set([...ids, ...lines.map((line) => line.id)]));
}

/** Línea → marca madre (líneas sin archivar): los conteos de la madre suman sus líneas. */
export async function getBrandParents(storeId: string): Promise<Map<string, string>> {
  const lines = await prismadb.brand.findMany({
    where: { storeId, parentBrandId: { not: null }, isArchived: false },
    select: { id: true, parentBrandId: true },
  });
  return new Map(lines.map((line) => [line.id, line.parentBrandId as string]));
}

export async function getPublicBrandsForFacets(storeId: string) {
  return prismadb.brand.findMany({
    where: { storeId, isVisible: true, isArchived: false },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      logoHasBackground: true,
      logoPermission: true,
      sortOrder: true,
      parentBrandId: true,
    },
  });
}
