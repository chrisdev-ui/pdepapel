import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreHealthSummary } from "@/lib/mercadolibre/health";
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

    return NextResponse.json(
      await getMercadoLibreHealthSummary(connection.id),
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_HEALTH_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
