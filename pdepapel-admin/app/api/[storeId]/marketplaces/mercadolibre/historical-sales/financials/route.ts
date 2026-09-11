import { auth } from "@clerk/nextjs/server";
import { MarketplaceConnectionStatus, MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getMercadoLibreOrderFinancials,
  MercadoLibreFinancialsPendingError,
} from "@/lib/mercadolibre/order-financials";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const EXTERNAL_ORDER_ID_PATTERN = /^\d{8,30}$/;

/**
 * Cargos reales de una venta según la facturación de Mercado Libre, para
 * rellenar el formulario de importación en vez de copiarlos a mano. Solo lee.
 */
export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const url = new URL(request.url);
    const externalOrderId = url.searchParams.get("order")?.trim() ?? "";
    const totalAmount = Number(url.searchParams.get("total"));
    if (!EXTERNAL_ORDER_ID_PATTERN.test(externalOrderId)) {
      throw ErrorFactory.InvalidRequest(
        "El número de venta de Mercado Libre no es válido",
      );
    }
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      throw ErrorFactory.InvalidRequest("El total de la venta no es válido");
    }

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true, status: true },
    });
    if (!connection || connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw ErrorFactory.InvalidRequest(
        "Conecta una cuenta activa de Mercado Libre primero",
      );
    }

    try {
      const financials = await getMercadoLibreOrderFinancials(
        connection.id,
        externalOrderId,
        totalAmount,
      );
      return NextResponse.json(
        { pending: false, ...financials },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    } catch (error) {
      if (error instanceof MercadoLibreFinancialsPendingError) {
        return NextResponse.json(
          { pending: true, message: error.message },
          { headers: CACHE_HEADERS.NO_CACHE },
        );
      }
      throw error;
    }
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_HISTORICAL_SALES_FINANCIALS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
