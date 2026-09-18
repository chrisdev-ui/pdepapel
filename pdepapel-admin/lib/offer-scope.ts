import { DiscountType, type PrismaClient } from "@prisma/client";

export interface ScopeOffer {
  id: string;
  name: string;
  type: DiscountType;
  amount: number;
  productIds: string[];
  categoryIds: string[];
  productGroupIds: string[];
}

export interface ScopeProductRef {
  id: string;
  categoryId: string;
  productGroupId: string | null;
}

export interface ScopeInput {
  productIds: string[];
  categoryIds: string[];
  productGroupIds: string[];
  type?: DiscountType;
  amount?: number;
  excludeOfferId?: string | null;
}

export interface ScopeOverlap {
  offerId: string;
  name: string;
  type: DiscountType;
  amount: number;
  after: number;
}

export interface ScopeProductRow {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  categoryId: string;
  categoryName: string;
  productGroupId: string | null;
  imageUrl: string | null;
  overlaps: ScopeOverlap[];
}

export interface ScopeSummary {
  affected: number;
  sellable: number;
  byProducts: number;
  byCategories: number;
  byGroups: number;
  overlaps: { count: number; names: string[] };
  free: { count: number; names: string[] };
  sample: { name: string; price: number } | null;
}

export const SCOPE_SEARCH_LIMIT = 20;

/** Precio final con el mismo redondeo de la tienda (`lib/discount-engine.ts`). */
export function priceAfter(type: DiscountType | undefined, amount: number | undefined, price: number): number {
  if (!type || !amount || amount <= 0) return price;
  if (type === DiscountType.PERCENTAGE) return Math.max(0, Math.round(price * (1 - amount / 100)));
  return Math.max(0, price - amount);
}

/** Ofertas que ya alcanzan al producto, directamente o por su subcategoría o grupo. */
export function overlapsFor(offers: ScopeOffer[], product: ScopeProductRef): ScopeOffer[] {
  return offers.filter(
    (offer) =>
      offer.productIds.includes(product.id) ||
      offer.categoryIds.includes(product.categoryId) ||
      (product.productGroupId !== null && offer.productGroupIds.includes(product.productGroupId)),
  );
}

/** Aplica `overlapsFor` y calcula el precio que dejaría cada oferta. */
export function describeOverlaps(offers: ScopeOffer[], product: ScopeProductRef & { price: number }): ScopeOverlap[] {
  return overlapsFor(offers, product).map((offer) => ({ offerId: offer.id, name: offer.name, type: offer.type, amount: offer.amount, after: priceAfter(offer.type, offer.amount, product.price) }));
}

type ScopeDatabase = Pick<PrismaClient, "offer" | "product">;

/** Ofertas vigentes hoy con sus destinos, sin la que se está editando. */
export async function loadActiveScopeOffers(db: Pick<PrismaClient, "offer">, storeId: string, excludeOfferId?: string | null, now = new Date()): Promise<ScopeOffer[]> {
  const offers = await db.offer.findMany({
    where: { storeId, isActive: true, startDate: { lte: now }, endDate: { gte: now }, ...(excludeOfferId ? { id: { not: excludeOfferId } } : {}) },
    select: { id: true, name: true, type: true, amount: true, products: { select: { productId: true } }, categories: { select: { categoryId: true } }, productGroups: { select: { productGroupId: true } } },
  });
  return offers.map((offer) => ({
    id: offer.id,
    name: offer.name,
    type: offer.type,
    amount: offer.amount,
    productIds: offer.products.map((row) => row.productId),
    categoryIds: offer.categories.map((row) => row.categoryId),
    productGroupIds: offer.productGroups.map((row) => row.productGroupId),
  }));
}

const productSelect = {
  id: true,
  name: true,
  sku: true,
  price: true,
  stock: true,
  categoryId: true,
  productGroupId: true,
  category: { select: { name: true } },
  images: { select: { url: true }, where: { isMain: true }, take: 1 },
} as const;

/** Búsqueda paginada para el selector de alcance: nunca el catálogo entero. */
export async function searchScopeProducts(
  db: ScopeDatabase,
  storeId: string,
  options: { query?: string; includeOutOfStock?: boolean; limit?: number; excludeOfferId?: string | null },
): Promise<{ products: ScopeProductRow[]; hasMore: boolean }> {
  const query = (options.query ?? "").trim();
  const limit = Math.min(Math.max(options.limit ?? SCOPE_SEARCH_LIMIT, 1), 50);
  const [products, offers] = await Promise.all([
    db.product.findMany({
      where: {
        storeId,
        isArchived: false,
        ...(options.includeOutOfStock ? {} : { stock: { gt: 0 } }),
        ...(query ? { OR: [{ name: { contains: query } }, { sku: { contains: query } }, { category: { name: { contains: query } } }] } : {}),
      },
      select: productSelect,
      orderBy: [{ soldCount: "desc" }, { name: "asc" }],
      take: limit + 1,
    }),
    loadActiveScopeOffers(db, storeId, options.excludeOfferId),
  ]);
  const hasMore = products.length > limit;
  return {
    hasMore,
    products: products.slice(0, limit).map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      stock: product.stock,
      categoryId: product.categoryId,
      categoryName: product.category.name,
      productGroupId: product.productGroupId,
      imageUrl: product.images.at(0)?.url ?? null,
      overlaps: describeOverlaps(offers, product),
    })),
  };
}

/** Productos por id para mostrar los ya elegidos (edición o duplicado) con su precio y stock. */
export async function loadScopeProducts(db: ScopeDatabase, storeId: string, productIds: string[], excludeOfferId?: string | null): Promise<ScopeProductRow[]> {
  if (productIds.length === 0) return [];
  const [products, offers] = await Promise.all([
    db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { ...productSelect, isArchived: true }, orderBy: { name: "asc" } }),
    loadActiveScopeOffers(db, storeId, excludeOfferId),
  ]);
  return products.map((product) => ({
    id: product.id,
    name: product.isArchived ? `${product.name} (archivado)` : product.name,
    sku: product.sku,
    price: product.price,
    stock: product.stock,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    productGroupId: product.productGroupId,
    imageUrl: product.images.at(0)?.url ?? null,
    overlaps: describeOverlaps(offers, product),
  }));
}

/** Lo que la clienta verá con este alcance: cuántos productos, choques con otras ofertas y los que quedarían en $ 0. */
export async function summarizeScope(db: ScopeDatabase, storeId: string, input: ScopeInput): Promise<ScopeSummary> {
  const empty: ScopeSummary = { affected: 0, sellable: 0, byProducts: 0, byCategories: 0, byGroups: 0, overlaps: { count: 0, names: [] }, free: { count: 0, names: [] }, sample: null };
  const conditions = [
    ...(input.productIds.length ? [{ id: { in: input.productIds } }] : []),
    ...(input.categoryIds.length ? [{ categoryId: { in: input.categoryIds } }] : []),
    ...(input.productGroupIds.length ? [{ productGroupId: { in: input.productGroupIds } }] : []),
  ];
  if (conditions.length === 0) return empty;
  const [products, offers] = await Promise.all([
    db.product.findMany({
      where: { storeId, isArchived: false, OR: conditions },
      select: { id: true, name: true, price: true, stock: true, categoryId: true, productGroupId: true },
      orderBy: [{ soldCount: "desc" }, { name: "asc" }],
    }),
    loadActiveScopeOffers(db, storeId, input.excludeOfferId),
  ]);
  const overlapping = products.filter((product) => overlapsFor(offers, product).length > 0);
  const free = input.type === DiscountType.FIXED && input.amount ? products.filter((product) => product.price <= input.amount!) : [];
  return {
    affected: products.length,
    sellable: products.filter((product) => product.stock > 0).length,
    byProducts: products.filter((product) => input.productIds.includes(product.id)).length,
    byCategories: products.filter((product) => input.categoryIds.includes(product.categoryId)).length,
    byGroups: products.filter((product) => product.productGroupId !== null && input.productGroupIds.includes(product.productGroupId)).length,
    overlaps: { count: overlapping.length, names: overlapping.slice(0, 3).map((product) => product.name) },
    free: { count: free.length, names: free.slice(0, 3).map((product) => product.name) },
    sample: products[0] ? { name: products[0].name, price: products[0].price } : null,
  };
}
