import { MarketplaceListingStatus, type Prisma } from "@prisma/client";

import { queueMarketplaceListingStatusSyncEvent } from "./mercadolibre/outbox";

type ArchiveTx = Pick<
  Prisma.TransactionClient,
  "marketplaceListing" | "marketplaceOutboxEvent"
>;

/**
 * Archivar un producto lo saca de la tienda, pero su publicación en Mercado
 * Libre seguía activa y vendible. Se encola la pausa de cada publicación
 * activa; restaurar el producto NO la reactiva sola (eso se decide desde
 * Mercado Libre).
 */
export async function pauseMarketplaceListingsForProducts(
  tx: ArchiveTx,
  productIds: string[],
): Promise<number> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return 0;
  const listings = await tx.marketplaceListing.findMany({
    where: {
      productId: { in: ids },
      externalItemId: { not: null },
      status: MarketplaceListingStatus.ACTIVE,
    },
    select: { id: true, connectionId: true, productId: true },
  });
  for (const listing of listings) {
    await queueMarketplaceListingStatusSyncEvent(tx, {
      connectionId: listing.connectionId,
      listingId: listing.id,
      productId: listing.productId,
      targetStatus: "paused",
    });
  }
  return listings.length;
}
