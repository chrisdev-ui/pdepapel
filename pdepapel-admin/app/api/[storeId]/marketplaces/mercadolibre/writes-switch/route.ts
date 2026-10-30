import { auth } from "@clerk/nextjs/server";
import { MarketplaceOutboxStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { enqueuePendingMarketplaceOutboxEventsForStore } from "@/lib/mercadolibre/outbox";
import { MERCADOLIBRE_WRITES_PAUSED_MESSAGE } from "@/lib/mercadolibre/writes-switch";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Interruptor de emergencia de Mercado Libre: solo la dueña. Al reanudar, lo
 * que la pausa dejó esperando sale de inmediato (el stock con su última cifra).
 */
export async function PUT(request: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await requireJsonBody<{ paused?: unknown }>(request, "MERCADOLIBRE_WRITES_SWITCH_PUT");
    if (typeof body.paused !== "boolean") throw ErrorFactory.InvalidRequest("Indica si las escrituras quedan pausadas");

    const data = body.paused
      ? { mercadoLibreWritesPaused: true, mercadoLibreWritesPausedAt: new Date(), mercadoLibreWritesPausedBy: userId }
      : { mercadoLibreWritesPaused: false, mercadoLibreWritesPausedAt: null, mercadoLibreWritesPausedBy: null };
    await prismadb.storeSettings.upsert({ where: { storeId: params.storeId }, create: { storeId: params.storeId, ...data }, update: data });

    let released = 0;
    if (!body.paused) {
      const waiting = await prismadb.marketplaceOutboxEvent.updateMany({
        where: {
          connection: { storeId: params.storeId },
          status: MarketplaceOutboxStatus.RETRY,
          lastError: MERCADOLIBRE_WRITES_PAUSED_MESSAGE,
        },
        data: { availableAt: new Date(), lastError: null },
      });
      released = waiting.count;
      try {
        await enqueuePendingMarketplaceOutboxEventsForStore(params.storeId);
      } catch (error) {
        // La recuperación programada los toma igual en pocos minutos.
        console.warn("[MERCADOLIBRE_WRITES_SWITCH] No se encolaron los pendientes al reanudar:", error);
      }
    }

    return NextResponse.json({ paused: body.paused, released }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_WRITES_SWITCH_PUT", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 401, 403],
    });
  }
}
