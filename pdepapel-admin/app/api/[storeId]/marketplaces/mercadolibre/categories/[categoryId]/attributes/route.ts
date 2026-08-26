import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  isMercadoLibreCategoryId,
} from "@/lib/mercadolibre/categories";
import { inspectMercadoLibreCategory } from "@/lib/mercadolibre/category-validation";
import { getMercadoLibreCategoryAppError } from "@/lib/mercadolibre/category-validation-error";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    if (!isMercadoLibreCategoryId(params.categoryId)) {
      throw ErrorFactory.InvalidRequest(
        "La categoría de Mercado Libre no es válida",
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

    const inspection = await inspectMercadoLibreCategory(
      connection.id,
      params.categoryId,
      { includeAttributes: true },
    );
    if (!inspection.ok) {
      throw getMercadoLibreCategoryAppError(inspection);
    }

    return NextResponse.json(inspection.attributes ?? [], {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CATEGORY_ATTRIBUTES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
