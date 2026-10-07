import { auth } from "@clerk/nextjs/server";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreHealthSummary } from "@/lib/mercadolibre/health";
import { annotateIssues } from "@/lib/mercadolibre/health-alerts";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
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

    const summary = await getMercadoLibreHealthSummary(connection.id);
    // Cada alerta con su clave y si ya se marcó como revisada (#8).
    return NextResponse.json(
      { ...summary, issues: await annotateIssues(connection.id, summary.issues) },
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
