import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { inspectMercadoLibreHistoricalSale } from "@/lib/mercadolibre/historical-sales";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await request.json()) as Record<string, unknown>;
    const reference =
      typeof body.reference === "string" ? body.reference.trim() : "";
    if (!reference) {
      throw ErrorFactory.InvalidRequest("Ingresa el número de venta u orden");
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
    if (
      !connection ||
      connection.status !== MarketplaceConnectionStatus.CONNECTED
    ) {
      throw ErrorFactory.InvalidRequest(
        "Conecta una cuenta activa de Mercado Libre primero",
      );
    }

    try {
      const inspection = await inspectMercadoLibreHistoricalSale(
        connection.id,
        params.storeId,
        reference,
      );
      return NextResponse.json(inspection, { headers: CACHE_HEADERS.NO_CACHE });
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        error instanceof Error
          ? error.message
          : "No fue posible revisar la venta de Mercado Libre",
      );
    }
  } catch (error) {
    return handleErrorResponse(
      error,
      "MERCADOLIBRE_HISTORICAL_SALE_INSPECT_POST",
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  }
}
