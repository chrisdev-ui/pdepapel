import type { PrismaClient } from "@prisma/client";

import { getPublicIdFromCloudinaryUrl } from "@/lib/utils";

/**
 * Qué archivos de Cloudinary referencia la base de datos, en todas las
 * tiendas (la nube es una sola). Antes el escaneo de huérfanos miraba solo
 * las fotos de productos: las guardadas como historial en los pedidos
 * (`OrderItem.imageUrl`) y los videos salían como «huérfanos» y se podían
 * borrar desde el panel.
 */
export type ReferenceSource =
  | "Image"
  | "OrderItem.imageUrl"
  | "ProductVideo"
  | "Category.imageUrl"
  | "HomeContent"
  | "Store"
  | "Shipping"
  | "Product.description"
  | "ProductGroup.description"
  | "ConversationMessage.mediaUrl";

export type ReferenceDb = Pick<
  PrismaClient,
  | "image"
  | "orderItem"
  | "productVideo"
  | "category"
  | "homeContent"
  | "store"
  | "shipping"
  | "product"
  | "productGroup"
  | "conversationMessage"
>;

const URL_PATTERN = /https?:\/\/res\.cloudinary\.com\/[^\s"')<>]+/g;

export async function collectReferencedPublicIds(db: ReferenceDb): Promise<Map<string, Set<ReferenceSource>>> {
  const refs = new Map<string, Set<ReferenceSource>>();
  const add = (text: string | null | undefined, source: ReferenceSource) => {
    if (!text) return;
    for (const url of text.match(URL_PATTERN) ?? []) {
      const id = getPublicIdFromCloudinaryUrl(url);
      if (!id) continue;
      if (!refs.has(id)) refs.set(id, new Set());
      refs.get(id)!.add(source);
    }
  };

  const [images, orderItems, videos, categories, homeContents, stores, shippings, products, groups, messages] =
    await Promise.all([
      db.image.findMany({ select: { url: true } }),
      db.orderItem.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
      db.productVideo.findMany({ select: { url: true } }),
      db.category.findMany({ where: { imageUrl: { not: null } }, select: { imageUrl: true } }),
      db.homeContent.findMany({ select: { imageUrl: true, primaryUrl: true, secondaryUrl: true } }),
      db.store.findMany({ select: { logoUrl: true, policies: true } }),
      db.shipping.findMany({ select: { guideUrl: true, trackingUrl: true } }),
      db.product.findMany({ select: { description: true } }),
      db.productGroup.findMany({ select: { description: true } }),
      db.conversationMessage.findMany({ where: { mediaUrl: { not: null } }, select: { mediaUrl: true } }),
    ]);

  images.forEach((row) => add(row.url, "Image"));
  orderItems.forEach((row) => add(row.imageUrl, "OrderItem.imageUrl"));
  videos.forEach((row) => add(row.url, "ProductVideo"));
  categories.forEach((row) => add(row.imageUrl, "Category.imageUrl"));
  homeContents.forEach((row) => {
    add(row.imageUrl, "HomeContent");
    add(row.primaryUrl, "HomeContent");
    add(row.secondaryUrl, "HomeContent");
  });
  stores.forEach((row) => {
    add(row.logoUrl, "Store");
    add(row.policies ? JSON.stringify(row.policies) : null, "Store");
  });
  shippings.forEach((row) => {
    add(row.guideUrl, "Shipping");
    add(row.trackingUrl, "Shipping");
  });
  products.forEach((row) => add(row.description, "Product.description"));
  groups.forEach((row) => add(row.description, "ProductGroup.description"));
  messages.forEach((row) => add(row.mediaUrl, "ConversationMessage.mediaUrl"));

  return refs;
}

export interface CloudinaryResourceLike {
  public_id: string;
  bytes?: number;
}

/** Los recursos que ninguna fila referencia. */
export function findOrphanResources<T extends CloudinaryResourceLike>(
  resources: T[],
  referenced: Map<string, Set<ReferenceSource>> | Set<string>,
): T[] {
  return resources.filter((resource) => !referenced.has(resource.public_id));
}

/** De una lista pedida para borrar, cuáles siguen referenciadas (y por quién). */
export function findStillReferenced(
  publicIds: string[],
  referenced: Map<string, Set<ReferenceSource>>,
): { publicId: string; sources: ReferenceSource[] }[] {
  return publicIds
    .filter((id) => referenced.has(id))
    .map((id) => ({ publicId: id, sources: Array.from(referenced.get(id) ?? []) }));
}
