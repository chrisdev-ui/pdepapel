import { MarketplaceListingStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getMarketplaceListingStatusFromRemote } from "./listings";

/**
 * Estados locales que reflejan lo que hay en Mercado Libre y se pueden
 * actualizar desde allá. DRAFT y UNLINKED no tienen ítem vivo, y ERROR es un
 * fallo nuestro al sincronizar que un «active» remoto no arregla.
 */
const MIRRORED_STATUSES: MarketplaceListingStatus[] = [
  MarketplaceListingStatus.ACTIVE,
  MarketplaceListingStatus.PAUSED,
  MarketplaceListingStatus.CLOSED,
];

/**
 * Aviso `items` de Mercado Libre: el ítem cambió (lo pausó por falta de
 * stock, lo cerró, lo reactivó…). Antes no se procesaba y el estado local se
 * quedaba en el de la importación: el 2026-10-07 cuatro publicaciones
 * seguían «Activa» en el panel con semanas pausadas en Mercado Libre (#8).
 *
 * Necesita que la aplicación esté suscrita al tema `items` en el portal de
 * desarrolladores de Mercado Libre; sin la suscripción no llega nada.
 */
export async function synchronizeMercadoLibreItemStatus(
  connectionId: string,
  payload: Record<string, unknown>,
): Promise<{ updated: number }> {
  const externalItemId = typeof payload.id === "string" ? payload.id.trim() : "";
  const remoteStatus = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : null;
  if (!externalItemId || !remoteStatus) return { updated: 0 };

  const { status } = getMarketplaceListingStatusFromRemote(remoteStatus);
  const lastUpdated =
    typeof payload.last_updated === "string" ? new Date(payload.last_updated) : null;
  const result = await prismadb.marketplaceListing.updateMany({
    where: {
      connectionId,
      externalItemId,
      status: { in: MIRRORED_STATUSES },
    },
    data: {
      status,
      lastRemoteUpdateAt:
        lastUpdated && !Number.isNaN(lastUpdated.getTime()) ? lastUpdated : new Date(),
    },
  });
  return { updated: result.count };
}
