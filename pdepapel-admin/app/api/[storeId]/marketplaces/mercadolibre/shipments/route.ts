import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getEffectiveMercadoLibreShipmentStatus } from "@/lib/mercadolibre/logistics-status";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true },
    });
    if (!connection) {
      throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
    }
    const shipments = await prismadb.marketplaceShipment.findMany({
      where: { connectionId: connection.id },
      select: {
        id: true,
        externalShipmentId: true,
        status: true,
        substatus: true,
        logisticsType: true,
        trackingNumber: true,
        lastRemoteUpdateAt: true,
        marketplaceOrder: {
          select: {
            id: true,
            externalOrderId: true,
            buyerName: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json(
      shipments.map(({ marketplaceOrder, status, ...shipment }) => ({
        ...shipment,
        status: getEffectiveMercadoLibreShipmentStatus(
          status,
          marketplaceOrder?.status,
        ),
        marketplaceOrder: marketplaceOrder
          ? {
              id: marketplaceOrder.id,
              externalOrderId: marketplaceOrder.externalOrderId,
              buyerName: marketplaceOrder.buyerName,
            }
          : null,
      })),
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_SHIPMENTS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
