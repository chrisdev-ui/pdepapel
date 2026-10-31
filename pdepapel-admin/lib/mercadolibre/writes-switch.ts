import { MarketplaceOutboxAction } from "@prisma/client";

import { AppError } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";

/**
 * Interruptor de emergencia de Mercado Libre (`StoreSettings.mercadoLibreWritesPaused`,
 * nace en pausa; sin fila de ajustes también cuenta como pausa). Encendido, solo
 * pasa lo que protege de vender de más (decisión de Christian, 2026-10-30): las
 * bajadas de stock y la pausa de una publicación que quedó en cero. Todo lo
 * demás espera: subidas de stock, precio, activar, publicar, fotos,
 * descripción, condiciones de venta y publicidad. Responder preguntas de
 * compradoras no se frena (es atención, no catálogo).
 *
 * Se lee en cada escritura, sin caché: un interruptor que tarda minutos en
 * actuar no sirve. La cola sigue guardando lo pendiente (el stock deduplica por
 * publicación, así que queda la última cifra) y lo envía al apagarlo.
 */
export const MERCADOLIBRE_WRITES_PAUSED_MESSAGE =
  "Las escrituras a Mercado Libre están pausadas desde el panel (Mercado Libre → «Pausar escrituras»). Nada se envió.";

export const MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE =
  "Subida de stock retenida: las escrituras a Mercado Libre están pausadas. Sale al reanudar.";

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
  return settings ? settings.mercadoLibreWritesPaused : true;
}

export async function areMercadoLibreWritesPaused(connectionId: string): Promise<boolean> {
  const connection = await prismadb.marketplaceConnection.findUnique({
    where: { id: connectionId },
    select: { store: { select: { settings: { select: { mercadoLibreWritesPaused: true } } } } },
  });
  const settings = connection?.store?.settings;
  return settings ? settings.mercadoLibreWritesPaused : true;
}

export async function assertMercadoLibreWritesAllowed(connectionId: string) {
  if (await areMercadoLibreWritesPaused(connectionId)) throw new MercadoLibreWritesPausedError();
}

export type PausedWriteDecision = { allow: true } | { allow: false; message: string; stockIncrease: boolean };

/**
 * Qué deja pasar la pausa. Una bajada se prueba contra lo último que se envió
 * (`lastSyncedStock`); sin ese dato solo pasa el cero, que nunca hace vender de más.
 */
export function pausedWriteDecision(input: {
  action: MarketplaceOutboxAction;
  targetQuantity?: number | null;
  lastSyncedStock?: number | null;
  targetStatus?: "active" | "paused" | null;
  sellableQuantity?: number | null;
}): PausedWriteDecision {
  if (input.action === MarketplaceOutboxAction.SYNC_STOCK && typeof input.targetQuantity === "number") {
    if (input.targetQuantity === 0) return { allow: true };
    if (typeof input.lastSyncedStock === "number" && input.targetQuantity <= input.lastSyncedStock) return { allow: true };
    return { allow: false, message: MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE, stockIncrease: true };
  }
  const pausing =
    input.action === MarketplaceOutboxAction.PAUSE_LISTING ||
    (input.action === MarketplaceOutboxAction.SYNC_LISTING_STATUS && input.targetStatus === "paused");
  if (pausing && input.sellableQuantity === 0) return { allow: true };
  return { allow: false, message: MERCADOLIBRE_WRITES_PAUSED_MESSAGE, stockIncrease: false };
}
