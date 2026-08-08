import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { reconcileMercadoLibreHistoricalSale } from "@/lib/mercadolibre/historical-sales";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function parseAmount(value: unknown, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw ErrorFactory.InvalidRequest(`${label} debe ser mayor o igual a cero`);
  }
  return amount;
}

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
    const externalOrderId =
      typeof body.externalOrderId === "string"
        ? body.externalOrderId.trim()
        : "";
    if (!externalOrderId)
      throw ErrorFactory.InvalidRequest("Selecciona una orden");

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
      const result = await reconcileMercadoLibreHistoricalSale({
        connectionId: connection.id,
        storeId: params.storeId,
        externalOrderId,
        financials: {
          marketplaceFee: parseAmount(
            body.marketplaceFee,
            "El cargo por venta",
          ),
          shippingCost: parseAmount(body.shippingCost, "El costo de envío"),
          taxesAmount: parseAmount(body.taxesAmount, "Los impuestos"),
        },
      });
      return NextResponse.json(result, {
        status: 201,
        headers: CACHE_HEADERS.NO_CACHE,
      });
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        error instanceof Error
          ? error.message
          : "No fue posible conciliar la venta de Mercado Libre",
      );
    }
  } catch (error) {
    return handleErrorResponse(
      error,
      "MERCADOLIBRE_HISTORICAL_SALE_RECONCILE_POST",
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  }
}
