import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getMercadoLibreCashflowSummary,
  refreshMercadoLibreCashflowReleaseStatuses,
} from "@/lib/mercadolibre/cashflow";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

async function getCashflowConnection(storeId: string) {
  const connection = await prismadb.marketplaceConnection.findUnique({
    where: {
      storeId_provider: {
        storeId,
        provider: MarketplaceProvider.MERCADOLIBRE,
      },
    },
    select: { id: true },
  });
  if (!connection) {
    throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
  }

  return connection;
}

async function authorizeCashflow({ params }: { params: { storeId: string } }) {
  const { userId } = auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!params.storeId) throw ErrorFactory.MissingStoreId();
  await verifyStoreOwner(userId, params.storeId);

  return getCashflowConnection(params.storeId);
}

export async function GET(
  _request: Request,
  context: { params: { storeId: string } },
) {
  try {
    const connection = await authorizeCashflow(context);

    return NextResponse.json(
      await getMercadoLibreCashflowSummary(connection.id),
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CASHFLOW_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function POST(
  _request: Request,
  context: { params: { storeId: string } },
) {
  try {
    const connection = await authorizeCashflow(context);
    const refresh = await refreshMercadoLibreCashflowReleaseStatuses(
      connection.id,
    );

    return NextResponse.json(
      {
        ...(await getMercadoLibreCashflowSummary(connection.id)),
        refresh,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CASHFLOW_REFRESH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
