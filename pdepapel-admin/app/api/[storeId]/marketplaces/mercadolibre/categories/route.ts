import { auth } from "@clerk/nextjs/server";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  MAX_CONCURRENT_CATEGORY_INSPECTIONS,
  MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
  MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED,
  parseMercadoLibreCategorySuggestions,
  type MercadoLibreCategorySearchResponse,
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
    const { userId } = await auth();
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
    // Cada sugerencia se verifica con Mercado Libre (categoría final y
    // publicable), pero de a pocas: una ráfaga de ocho llamadas simultáneas
    // dispara el límite por aplicación y devuelve 429 en cadena.
    const inspections = await mapWithConcurrency(
      candidates,
      MAX_CONCURRENT_CATEGORY_INSPECTIONS,
      async (suggestion) => ({
        suggestion,
        inspection: await inspectMercadoLibreCategory(
          connection.id,
          suggestion.categoryId,
        ),
      }),
    );
    const suggestions = inspections.flatMap(({ suggestion, inspection }) =>
      inspection.ok ? [{ ...suggestion, path: inspection.path }] : [],
    );
    // Las que Mercado Libre rechazó como no publicables desaparecen en
    // silencio; las que no pudo verificar se cuentan para decirlo en pantalla.
    const unavailable = inspections.flatMap(({ inspection }) =>
      !inspection.ok &&
      inspection.code !== MERCADOLIBRE_CATEGORY_REVIEW_REQUIRED
        ? [inspection]
        : [],
    );
    const reauth = unavailable.find(
      (inspection) => inspection.code === MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
    );
    if (reauth) throw getMercadoLibreCategoryAppError(reauth);
    if (candidates.length > 0 && suggestions.length === 0 && unavailable[0]) {
      throw getMercadoLibreCategoryAppError(unavailable[0]);
    }

    const body: MercadoLibreCategorySearchResponse = {
      suggestions,
      unavailableCount: unavailable.length,
    };
    return NextResponse.json(body, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CATEGORIES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
