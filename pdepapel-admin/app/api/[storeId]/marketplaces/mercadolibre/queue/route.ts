import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  ensureMercadoLibreRecoverySchedule,
  getMercadoLibreQueueConfigurationStatus,
} from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function POST(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);
    const configuration = getMercadoLibreQueueConfigurationStatus();
    if (!configuration.configured) {
      throw ErrorFactory.InvalidRequest(
        `Faltan variables de QStash: ${configuration.missing.join(", ")}`,
      );
    }

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

    await ensureMercadoLibreRecoverySchedule(connection.id);
    return NextResponse.json(
      { success: true },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_QUEUE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
