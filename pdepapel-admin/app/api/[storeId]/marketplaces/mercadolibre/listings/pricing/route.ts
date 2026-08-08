import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreResource } from "@/lib/mercadolibre/client";
import { parseMercadoLibreListingPriceEstimate } from "@/lib/mercadolibre/listing-pricing";
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

    const searchParams = new URL(request.url).searchParams;
    const price = Number(searchParams.get("price"));
    const categoryId = searchParams.get("categoryId")?.trim() ?? "";
    const listingType = searchParams.get("listingType")?.trim() ?? "";
    if (!Number.isFinite(price) || price <= 0 || !categoryId || !listingType) {
      throw ErrorFactory.InvalidRequest(
        "Precio, categoría y tipo de publicación son obligatorios",
      );
    }

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true, siteId: true },
    });
    if (!connection) {
      throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
    }

    const resource = `/sites/${encodeURIComponent(connection.siteId)}/listing_prices?price=${encodeURIComponent(String(price))}&category_id=${encodeURIComponent(categoryId)}&listing_type_id=${encodeURIComponent(listingType)}`;
    const payload = await getMercadoLibreResource(connection.id, resource);
    const estimate = parseMercadoLibreListingPriceEstimate(payload);
    if (!estimate) {
      throw ErrorFactory.InvalidRequest(
        "Mercado Libre no devolvió una comisión para esa publicación",
      );
    }

    return NextResponse.json(estimate, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_PRICING_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
