import type { Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

import { getMercadoLibreListingMetadataVersion } from "./listing-metadata";

type ListingWriter = Pick<typeof prismadb, "marketplaceListing"> | Prisma.TransactionClient;

export const LISTING_METADATA_CONFLICT_MESSAGE =
  "La publicación cambió mientras la editabas. Recarga la lista y vuelve a intentarlo.";

/**
 * Escribe una publicación cuyo `metadata` se construyó a partir de
 * `currentMetadata`: solo aplica si nadie la cambió entre la lectura y la
 * escritura (la versión guardada sigue siendo la leída). Sin marca previa
 * (fichas anteriores a la versión) la primera escritura la estrena.
 */
export async function updateMarketplaceListingMetadataGuarded(
  prisma: ListingWriter,
  {
    id,
    currentMetadata,
    data,
  }: {
    id: string;
    currentMetadata: Prisma.JsonValue | null;
    data: Prisma.MarketplaceListingUpdateInput;
  },
) {
  const expectedVersion = getMercadoLibreListingMetadataVersion(currentMetadata);
  const result = await prisma.marketplaceListing.updateMany({
    where: {
      id,
      ...(expectedVersion > 0
        ? { metadata: { path: "$.version", equals: expectedVersion } }
        : {}),
    },
    data,
  });
  if (result.count === 0) {
    throw ErrorFactory.Conflict(LISTING_METADATA_CONFLICT_MESSAGE);
  }
}
