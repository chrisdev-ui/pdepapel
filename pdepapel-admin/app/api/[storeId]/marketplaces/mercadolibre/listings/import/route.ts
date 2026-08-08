import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  importMercadoLibreListings,
  type MercadoLibreListingImportSelection,
} from "@/lib/mercadolibre/import-listings";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function parseSelections(value: unknown): MercadoLibreListingImportSelection[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw ErrorFactory.InvalidRequest(
      "Selecciona entre una y 500 publicaciones para importar",
    );
  }

  return value.map((selection) => {
    if (
      !selection ||
      typeof selection !== "object" ||
      Array.isArray(selection)
    ) {
      throw ErrorFactory.InvalidRequest(
        "Una publicación seleccionada no es válida",
      );
    }
    const data = selection as Record<string, unknown>;
    const externalItemId =
      typeof data.externalItemId === "string" ? data.externalItemId.trim() : "";
    const externalVariationId =
      typeof data.externalVariationId === "string" &&
      data.externalVariationId.trim()
        ? data.externalVariationId.trim()
        : null;
    const productId =
      typeof data.productId === "string" ? data.productId.trim() : "";
    if (!externalItemId || !productId) {
      throw ErrorFactory.InvalidRequest(
        "Cada publicación debe tener un producto local seleccionado",
      );
    }
    return { externalItemId, externalVariationId, productId };
  });
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
        status: true,
        recoveryScheduleId: true,
      },
    });
    if (
      !connection ||
      connection.status !== MarketplaceConnectionStatus.CONNECTED ||
      !connection.sellerId
    ) {
      throw ErrorFactory.InvalidRequest(
        "Conecta una cuenta activa de Mercado Libre primero",
      );
    }
    if (
      !getMercadoLibreQueueConfigurationStatus().configured ||
      !connection.recoveryScheduleId
    ) {
      throw ErrorFactory.InvalidRequest(
        "Activa el procesamiento seguro antes de importar publicaciones",
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const result = await importMercadoLibreListings({
      connectionId: connection.id,
      storeId: params.storeId,
      sellerId: connection.sellerId,
      selections: parseSelections(body.selections),
    });
    return NextResponse.json(result, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_IMPORT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
