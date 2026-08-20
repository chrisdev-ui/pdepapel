import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { refreshMercadoLibreShipments } from "@/lib/mercadolibre/logistics";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const EXTERNAL_SHIPMENT_ID_PATTERN = /^\d{8,30}$/;

/**
 * Re-reads a single shipment from Mercado Libre and re-synchronizes it.
 *
 * Unlike the bulk refresh, this one also refreshes a settled shipment, because
 * the administrator asked for that specific package.
 */
export async function POST(
  _request: Request,
  { params }: { params: { storeId: string; externalShipmentId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const externalShipmentId = params.externalShipmentId?.trim() ?? "";
    if (!EXTERNAL_SHIPMENT_ID_PATTERN.test(externalShipmentId)) {
      throw ErrorFactory.InvalidRequest(
        "El número de envío de Mercado Libre no es válido",
      );
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
      const result = await refreshMercadoLibreShipments(
        connection.id,
        externalShipmentId,
      );
      const failure = result.failures[0];
      if (failure) throw new Error(failure.message);

      const shipment = await prismadb.marketplaceShipment.findUnique({
        where: {
          connectionId_externalShipmentId: {
            connectionId: connection.id,
            externalShipmentId,
          },
        },
        select: {
          externalShipmentId: true,
          status: true,
          substatus: true,
          trackingNumber: true,
          lastRemoteUpdateAt: true,
        },
      });

      return NextResponse.json(shipment, { headers: CACHE_HEADERS.NO_CACHE });
    } catch (error) {
      throw ErrorFactory.InvalidRequest(
        error instanceof Error
          ? error.message
          : "No fue posible actualizar el envío desde Mercado Libre",
      );
    }
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_SHIPMENT_REFRESH_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
