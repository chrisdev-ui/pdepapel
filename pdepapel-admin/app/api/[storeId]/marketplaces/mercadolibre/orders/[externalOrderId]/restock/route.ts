import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { confirmMercadoLibreOrderReturn } from "@/lib/mercadolibre/order-restock";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const EXTERNAL_ORDER_ID_PATTERN = /^\d{8,30}$/;

/** Confirma el retorno físico de una venta cancelada y devuelve sus unidades al inventario. */
export async function POST(
  _request: Request,
  { params }: { params: { storeId: string; externalOrderId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const externalOrderId = params.externalOrderId?.trim() ?? "";
    if (!EXTERNAL_ORDER_ID_PATTERN.test(externalOrderId)) {
      throw ErrorFactory.InvalidRequest(
        "El número de venta de Mercado Libre no es válido",
      );
    }

    const summary = await confirmMercadoLibreOrderReturn({
      storeId: params.storeId,
      externalOrderId,
      userId,
    });
    if (summary.returned > 0) {
      await invalidateStoreProductsCache(params.storeId);
    }
    return NextResponse.json(
      { externalOrderId, ...summary },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_ORDER_RESTOCK_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
