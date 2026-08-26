import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
  parseMercadoLibreCategorySuggestions,
} from "@/lib/mercadolibre/categories";
import { inspectMercadoLibreCategory } from "@/lib/mercadolibre/category-validation";
import { getMercadoLibreCategoryAppError } from "@/lib/mercadolibre/category-validation-error";
import { getMercadoLibreJson } from "@/lib/mercadolibre/client";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
    if (query.length < 3 || query.length > 120) {
      throw ErrorFactory.InvalidRequest(
        "Escribe entre 3 y 120 caracteres para buscar una categoría",
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

    const resource = `/sites/MCO/domain_discovery/search?limit=8&q=${encodeURIComponent(query)}`;
    const payload = await getMercadoLibreJson(connection.id, resource);
    const candidates = parseMercadoLibreCategorySuggestions(payload);
    const inspections = await Promise.all(
      candidates.map(async (suggestion) => ({
        suggestion,
        inspection: await inspectMercadoLibreCategory(
          connection.id,
          suggestion.categoryId,
        ),
      })),
    );
    const suggestions = inspections.flatMap(({ suggestion, inspection }) =>
      inspection.ok ? [suggestion] : [],
    );

    if (candidates.length > 0 && suggestions.length === 0) {
      const unavailableInspection = inspections.find(
        ({ inspection }) =>
          !inspection.ok &&
          inspection.code !== MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
      )?.inspection;
      if (unavailableInspection && !unavailableInspection.ok) {
        throw getMercadoLibreCategoryAppError(unavailableInspection);
      }
    }

    return NextResponse.json(suggestions, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CATEGORIES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
