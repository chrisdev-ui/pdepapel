import prismadb from "@/lib/prismadb";
import {
  BRANDS_INDEX_PATH,
  BRANDS_TAG,
  PRODUCT_LIST_TAG,
  brandPagePath,
  brandTag,
  type StorefrontTarget,
} from "@/lib/storefront-cache-scope";

/**
 * Purga acotada de un cambio de marca (editar, ocultar, archivar, fusionar,
 * cambiar dirección, ordenar): la lista de marcas, la página de cada marca
 * (direcciones actuales, anteriores y nuevas), los listados y las fichas de
 * sus productos. Si no cabe en una purga acotada, `invalidateStoreProductsCache`
 * cae sola a la completa.
 */
export async function brandStorefrontTarget(
  storeId: string,
  input: { brandIds: string[]; slugs?: string[] },
): Promise<StorefrontTarget> {
  const brandIds = Array.from(new Set(input.brandIds));
  const [products, groups, brands, redirects] = brandIds.length
    ? await Promise.all([
        prismadb.product.findMany({ where: { storeId, brandId: { in: brandIds } }, select: { id: true } }),
        prismadb.productGroup.findMany({ where: { storeId, brandId: { in: brandIds } }, select: { id: true } }),
        prismadb.brand.findMany({ where: { storeId, id: { in: brandIds } }, select: { slug: true } }),
        prismadb.brandSlugRedirect.findMany({ where: { storeId, brandId: { in: brandIds } }, select: { oldSlug: true } }),
      ])
    : [[], [], [], []];
  const slugs = Array.from(
    new Set([
      ...(input.slugs ?? []),
      ...brands.map((brand) => brand.slug),
      ...redirects.map((redirect) => redirect.oldSlug),
    ]),
  );
  return {
    productIds: products.map((product) => product.id),
    productGroupIds: groups.map((group) => group.id),
    extra: {
      tags: [BRANDS_TAG, PRODUCT_LIST_TAG, ...slugs.map(brandTag)],
      paths: [BRANDS_INDEX_PATH, ...slugs.map(brandPagePath)],
    },
  };
}
