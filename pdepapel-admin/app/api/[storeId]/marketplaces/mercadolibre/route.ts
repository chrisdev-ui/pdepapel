import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreConfigurationStatus } from "@/lib/mercadolibre/config";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: {
        id: true,
        sellerId: true,
        siteId: true,
        status: true,
        lastSyncedAt: true,
        lastError: true,
        recoveryScheduleId: true,
        updatedAt: true,
      },
    });

    const [listingCount, pendingEventCount, pendingSyncCount] = connection
      ? await Promise.all([
          prismadb.marketplaceListing.count({
            where: { connectionId: connection.id },
          }),
          prismadb.marketplaceWebhookEvent.count({
            where: {
              connectionId: connection.id,
              status: { in: ["PENDING", "RETRY", "PROCESSING"] },
            },
          }),
          prismadb.marketplaceOutboxEvent.count({
            where: {
              connectionId: connection.id,
              status: { in: ["PENDING", "RETRY", "PROCESSING"] },
            },
          }),
        ])
      : [0, 0, 0];

    return NextResponse.json(
      {
        configuration: getMercadoLibreConfigurationStatus(),
        queueConfiguration: getMercadoLibreQueueConfigurationStatus(),
        connection,
        metrics: { listingCount, pendingEventCount, pendingSyncCount },
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_STATUS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
