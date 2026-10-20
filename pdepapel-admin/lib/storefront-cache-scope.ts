import type { PrismaClient } from "@prisma/client";

/**
 * Qué purgar en la tienda cuando cambian unos productos. Las etiquetas son un
 * contrato con `pdepapel-store/lib/catalog-cache.ts` y su lista blanca en
 * `app/api/revalidate/route.ts`: cambiar un nombre aquí sin cambiarlo allá
 * deja páginas viejas (o hace que la tienda rechace la purga).
 */
export const STOREFRONT_SCOPE_VERSION = 2;
export const PRODUCT_LIST_TAG = "products:list";
export const FEATURED_PRODUCTS_TAG = "products:featured";
export const productTag = (key: string) => `product:${key}`;
export const productGroupTag = (groupId: string) => `products:group:${groupId}`;
export const productCategoryTag = (category: string) => `products:category:${category}`;
export const productTypeTag = (type: string) => `products:type:${type}`;
/** Lista de marcas (menú, índice /marcas, sitemap). */
export const BRANDS_TAG = "brands";
/** Página de una marca (/marcas/<slug>). */
export const brandTag = (slug: string) => `brand:${slug}`;
export const brandPagePath = (slug: string) => `/marcas/${slug}`;
export const BRANDS_INDEX_PATH = "/marcas";

/** La edición de cápsulas LIVE: el enlace del menú, el banner del inicio y /capsulas. */
export const CAPSULES_TAG = "capsules";
export const CAPSULE_STOREFRONT_SCOPE: StorefrontScope = { tags: [CAPSULES_TAG], paths: ["/", "/capsulas"] };

/** Topes de la tienda; por encima se manda la purga completa. */
export const MAX_SCOPE_TAGS = 200;
export const MAX_SCOPE_PATHS = 50;

const SHOP_PATH = "/tienda";
const HOME_PATH = "/";
const productPath = (slug: string) => `/producto/${slug}`;
const categoryPath = (slug: string) => `/categoria/${slug}`;

export interface StorefrontScope {
  tags: string[];
  paths: string[];
}

export interface StorefrontTarget {
  productIds?: string[];
  /** Todas las variantes de estos grupos. */
  productGroupIds?: string[];
  orderIds?: string[];
  /** El alcance de antes del cambio (categoría, grupo o destacado anteriores). */
  previous?: StorefrontScope | null;
  /** Etiquetas y rutas que no son del catálogo y van en la misma purga (reseñas, inicio). */
  extra?: StorefrontScope;
}

type ScopeDb = Pick<PrismaClient, "product" | "productKit" | "productSlugAlias" | "orderItem">;

export function mergeScopes(...scopes: (StorefrontScope | null | undefined)[]): StorefrontScope {
  const tags = new Set<string>();
  const paths = new Set<string>();
  for (const scope of scopes) {
    scope?.tags.forEach((tag) => tags.add(tag));
    scope?.paths.forEach((path) => paths.add(path));
  }
  return { tags: Array.from(tags), paths: Array.from(paths) };
}

/** Cabe en una sola purga acotada; si no, el llamador manda la completa. */
export function fitsScopedPurge(scope: StorefrontScope): boolean {
  return scope.tags.length <= MAX_SCOPE_TAGS && scope.paths.length <= MAX_SCOPE_PATHS;
}

/**
 * Los productos tocados más los kits que los contienen y las piezas de los
 * kits tocados: el stock de un kit sale de sus piezas, así que vender una
 * pieza cambia la disponibilidad del kit y vender un kit cambia la de cada
 * pieza.
 */
async function expandKitRelations(db: ScopeDb, productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const links = await db.productKit.findMany({
    where: { OR: [{ kitId: { in: productIds } }, { componentId: { in: productIds } }] },
    select: { kitId: true, componentId: true },
  });
  const ids = new Set(productIds);
  for (const link of links) {
    ids.add(link.kitId);
    ids.add(link.componentId);
  }
  const components = links.filter((link) => productIds.includes(link.kitId)).map((link) => link.componentId);
  if (components.length > 0) {
    const siblingKits = await db.productKit.findMany({
      where: { componentId: { in: components } },
      select: { kitId: true },
    });
    siblingKits.forEach((link) => ids.add(link.kitId));
  }
  return Array.from(ids);
}

/**
 * Lo mínimo que hay que purgar para que ningún producto tocado se vea viejo:
 * su ficha (slug, id y alias viejos), las listas de su grupo, categoría y tipo,
 * la lista general (/tienda, inicio, carrito) y los destacados del encabezado
 * solo si alguno es destacado.
 */
export async function resolveProductStorefrontScope(
  db: ScopeDb,
  storeId: string,
  target: Pick<StorefrontTarget, "productIds" | "orderIds" | "productGroupIds">,
): Promise<StorefrontScope> {
  const directIds = new Set(target.productIds ?? []);
  const groupIds = target.productGroupIds ?? [];
  if (groupIds.length > 0) {
    const variants = await db.product.findMany({
      where: { storeId, productGroupId: { in: groupIds } },
      select: { id: true },
    });
    variants.forEach((variant) => directIds.add(variant.id));
  }
  if (target.orderIds && target.orderIds.length > 0) {
    const items = await db.orderItem.findMany({
      where: { orderId: { in: target.orderIds } },
      select: { productId: true },
    });
    items.forEach((item) => item.productId && directIds.add(item.productId));
  }
  const productIds = await expandKitRelations(db, Array.from(directIds));
  if (productIds.length === 0) {
    return groupIds.length > 0
      ? { tags: [PRODUCT_LIST_TAG, ...groupIds.map(productGroupTag)], paths: [SHOP_PATH, HOME_PATH] }
      : { tags: [], paths: [] };
  }

  const [products, aliases] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: {
        id: true,
        slug: true,
        isFeatured: true,
        productGroupId: true,
        categoryId: true,
        category: { select: { slug: true, typeId: true, type: { select: { slug: true } } } },
      },
    }),
    db.productSlugAlias.findMany({
      where: { productId: { in: productIds }, storeId },
      select: { slug: true },
    }),
  ]);

  const tags = new Set<string>([PRODUCT_LIST_TAG, ...groupIds.map(productGroupTag)]);
  const paths = new Set<string>([SHOP_PATH, HOME_PATH]);
  for (const product of products) {
    tags.add(productTag(product.id));
    if (product.slug) {
      tags.add(productTag(product.slug));
      paths.add(productPath(product.slug));
    }
    if (product.productGroupId) tags.add(productGroupTag(product.productGroupId));
    tags.add(productCategoryTag(product.categoryId));
    if (product.category?.slug) {
      tags.add(productCategoryTag(product.category.slug));
      paths.add(categoryPath(product.category.slug));
    }
    if (product.category?.typeId) tags.add(productTypeTag(product.category.typeId));
    if (product.category?.type?.slug) tags.add(productTypeTag(product.category.type.slug));
    if (product.isFeatured) tags.add(FEATURED_PRODUCTS_TAG);
  }
  aliases.forEach((alias) => alias.slug && tags.add(productTag(alias.slug)));

  return { tags: Array.from(tags), paths: Array.from(paths) };
}
