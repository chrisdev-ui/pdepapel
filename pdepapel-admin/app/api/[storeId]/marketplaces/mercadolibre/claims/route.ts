import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
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
    const claims = await prismadb.marketplaceClaim.findMany({
      where: { connectionId: connection.id },
      select: {
        id: true,
        externalClaimId: true,
        status: true,
        stage: true,
        type: true,
        reasonId: true,
        title: true,
        dueAt: true,
        lastRemoteUpdateAt: true,
        marketplaceOrder: {
          select: { id: true, externalOrderId: true, buyerName: true },
        },
      },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 100,
    });
    return NextResponse.json(claims, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CLAIMS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
