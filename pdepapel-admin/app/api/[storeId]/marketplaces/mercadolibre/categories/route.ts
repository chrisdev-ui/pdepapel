import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parseMercadoLibreCategorySuggestions } from "@/lib/mercadolibre/categories";
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
    const suggestions = parseMercadoLibreCategorySuggestions(payload);

    return NextResponse.json(suggestions, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_CATEGORIES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
