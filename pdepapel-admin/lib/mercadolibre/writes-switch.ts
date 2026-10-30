import { MarketplaceOutboxAction } from "@prisma/client";

import { AppError } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

/**
 * Interruptor de emergencia de Mercado Libre (`StoreSettings.mercadoLibreWritesPaused`).
 * Encendido, no sale ninguna escritura hacia Mercado Libre: publicar, precio,
 * stock, estado, fotos, descripción, condiciones de venta ni publicidad.
 * Responder preguntas de compradoras no se frena (es atención, no catálogo).
 *
 * Se lee en cada escritura, sin caché: un interruptor que tarda minutos en
 * actuar no sirve. La cola sigue guardando lo pendiente (el stock deduplica por
 * publicación, así que queda la última cifra) y lo envía al apagarlo.
 */
export const MERCADOLIBRE_WRITES_PAUSED_MESSAGE =
  "Las escrituras a Mercado Libre están pausadas desde el panel (Mercado Libre → «Pausar escrituras»). Nada se envió.";

export class MercadoLibreWritesPausedError extends AppError {
  constructor() {
    super(MERCADOLIBRE_WRITES_PAUSED_MESSAGE, 409, { writesPaused: true });
  }
}

/** Acciones de la cola que escriben en Mercado Libre; las demás (liquidaciones, correos) siguen. */
export const MERCADOLIBRE_WRITE_ACTIONS: ReadonlySet<MarketplaceOutboxAction> = new Set([
  MarketplaceOutboxAction.SYNC_STOCK,
  MarketplaceOutboxAction.SYNC_PRICE,
  MarketplaceOutboxAction.SYNC_LISTING_CONTENT,
  MarketplaceOutboxAction.SYNC_LISTING_STATUS,
  MarketplaceOutboxAction.PUBLISH_LISTING,
  MarketplaceOutboxAction.PAUSE_LISTING,
  MarketplaceOutboxAction.ACTIVATE_LISTING,
]);

export async function areMercadoLibreWritesPausedForStore(storeId: string): Promise<boolean> {
  const settings = await prismadb.storeSettings.findUnique({
    where: { storeId },
    select: { mercadoLibreWritesPaused: true },
  });
  return settings?.mercadoLibreWritesPaused === true;
}

export async function areMercadoLibreWritesPaused(connectionId: string): Promise<boolean> {
  const connection = await prismadb.marketplaceConnection.findUnique({
    where: { id: connectionId },
    select: { store: { select: { settings: { select: { mercadoLibreWritesPaused: true } } } } },
  });
  return connection?.store?.settings?.mercadoLibreWritesPaused === true;
}

export async function assertMercadoLibreWritesAllowed(connectionId: string) {
  if (await areMercadoLibreWritesPaused(connectionId)) throw new MercadoLibreWritesPausedError();
}
