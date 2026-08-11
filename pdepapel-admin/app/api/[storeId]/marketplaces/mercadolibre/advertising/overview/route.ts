import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreProductAdsOverview } from "@/lib/mercadolibre/product-ads";
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
      select: { id: true, siteId: true, status: true },
    });
    if (!connection) {
      throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
    }
    if (connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw ErrorFactory.InvalidRequest(
        "Reconecta Mercado Libre antes de consultar Product Ads",
      );
    }

    const overview = await getMercadoLibreProductAdsOverview({
      connectionId: connection.id,
      siteId: connection.siteId,
    });

    if (overview.state === "REAUTH_REQUIRED") {
      await prismadb.marketplaceConnection.update({
        where: { id: connection.id },
        data: {
          status: MarketplaceConnectionStatus.REAUTH_REQUIRED,
          lastError: overview.message,
        },
      });
    }

    return NextResponse.json(overview, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_ADVERTISING_OVERVIEW_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
