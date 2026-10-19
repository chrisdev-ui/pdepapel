"use server";

import { requireStoreRead } from "@/lib/store-access";

import { getActiveOffers } from "@/lib/discount-engine";
import type { ActiveOffer } from "@/lib/offer-pricing";
import { pickBestOffer } from "@/lib/offer-pricing";
import { effectiveStock, listProductPage, type ProductListQuery } from "@/lib/product-list";
import { resolveLowStockThreshold } from "@/lib/product-readiness";
import prismadb from "@/lib/prismadb";
import { scrubProduct } from "@/lib/viewer-payloads";

/**
 * Solo lo que pintan la tabla, la tarjeta del celular, el menú de cada fila y
 * las acciones en lote, para los productos de una página.
 */
const PRODUCT_ROW_SELECT = {
  id: true,
  categoryId: true,
  sku: true,
  slug: true,
  name: true,
  price: true,
  acqPrice: true,
  transportationCost: true,
  gtin: true,
  hasNoProductIdentifier: true,
  stock: true,
  reservedUnits: true,
  color: { select: { id: true, name: true } },
  isArchived: true,
  isFeatured: true,
  availableAt: true,
  productGroupId: true,
  isKit: true,
  kitComponents: {
    select: {
      quantity: true,
      component: {
        select: { stock: true },
      },
    },
  },
  images: {
    select: {
      url: true,
      isMain: true,
    },
    take: 1,
    orderBy: {
      isMain: "desc",
    },
  },
  _count: {
    select: {
      images: { where: { brokenAt: { not: null } } },
      kitComponents: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
    },
  },
  size: {
    select: {
      id: true,
      name: true,
    },
  },
  design: {
    select: {
      id: true,
      name: true,
    },
  },
  productGroup: {
    select: {
      id: true,
      name: true,
    },
  },
  brandId: true,
  brandRef: { select: { id: true, name: true, logoUrl: true, isArchived: true } },
  createdAt: true,
} as const;

export async function getProducts(storeId: string, query: ProductListQuery) {
  const access = await requireStoreRead(storeId);
  const viewer = access.role === "viewer";
  const [store, offers] = await Promise.all([
    prismadb.store.findUnique({ where: { id: storeId }, select: { lowStockThreshold: true } }).catch(() => null),
    getActiveOffers(storeId) as Promise<unknown> as Promise<ActiveOffer[]>,
  ]);
  const lowStockThreshold = store?.lowStockThreshold ?? null;
  const page = await listProductPage(prismadb, storeId, query, { offers, threshold: resolveLowStockThreshold(lowStockThreshold), viewer });
  const rows = page.ids.length
    ? await prismadb.product.findMany({ where: { id: { in: page.ids }, storeId }, select: PRODUCT_ROW_SELECT })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const products = page.ids.flatMap((id) => {
    const product = byId.get(id);
    if (!product) return [];
    const priceInfo = pickBestOffer(product, offers);
    // Una cuenta de solo lectura ve el catálogo sin el costo de compra.
    const visible = viewer ? scrubProduct(product) : product;
    return [
      {
        ...visible,
        brokenImages: product._count.images,
        stock: effectiveStock(product),
        discountedPrice: priceInfo.price,
        offerLabel: priceInfo.offerLabel ?? undefined,
        hasDiscount: priceInfo.price < product.price,
      },
    ];
  });

  return { ...page, products, lowStockThreshold };
}
