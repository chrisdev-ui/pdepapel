import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStorePromotionsCache } from "@/lib/cache";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";
import { refreshSoldCounts } from "@/lib/sold-count";
import { CACHE_HEADERS } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.NO_CACHE,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Cron diario: apaga las ofertas vencidas (nunca enciende ninguna) y refresca
 * la caché y la tienda de cada tienda con alguna oferta que empezó o terminó
 * en las últimas 24 h, para que los precios cambien aunque nadie edite nada.
 */
export async function GET(req: NextRequest) {
  try {
    const authToken = req.headers.get("authorization")?.split("Bearer ").at(1);

    if (!authToken || authToken !== env.CRON_SECRET)
      throw ErrorFactory.Unauthorized();

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const expiredOffers = await prismadb.offer.updateMany({
      where: { endDate: { lt: now }, isActive: true },
      data: { isActive: false },
    });

    // Orden «Más vendidos»: unidades de pedidos pagados o enviados.
    const refreshedSoldCounts = await refreshSoldCounts();

    const touchedStores = await prismadb.offer.findMany({
      where: {
        OR: [
          { startDate: { gte: dayAgo, lte: now } },
          { endDate: { gte: dayAgo, lte: now } },
        ],
      },
      select: { storeId: true },
      distinct: ["storeId"],
    });

    for (const { storeId } of touchedStores) {
      await invalidateStorePromotionsCache(storeId);
    }

    await recordJobRun("update-offers", {
      ok: true,
      detail: `${expiredOffers.count} vencidas apagadas, ${touchedStores.length} tiendas refrescadas`,
    });

    return NextResponse.json(
      {
        deactivated: expiredOffers.count,
        refreshedStores: touchedStores.length,
        refreshedSoldCounts,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    await recordJobRun("update-offers", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "OFFERS_CRON", { headers: corsHeaders });
  }
}
