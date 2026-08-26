import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getMercadoLibreJson } from "@/lib/mercadolibre/client";
import {
  addMercadoLibreInstallmentTerms,
  parseMercadoLibreListingPriceEstimate,
  parseMercadoLibreListingPriceEstimates,
} from "@/lib/mercadolibre/listing-pricing";
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
    if (!Number.isFinite(price) || price <= 0 || !categoryId) {
      throw ErrorFactory.InvalidRequest("Precio y categoría son obligatorios");
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

    const query = new URLSearchParams({
      price: String(price),
      category_id: categoryId,
    });
    if (listingType) query.set("listing_type_id", listingType);
    const resource = `/sites/${encodeURIComponent(connection.siteId)}/listing_prices?${query.toString()}`;
    const payload = await getMercadoLibreJson(connection.id, resource);
    if (!listingType) {
      const options = parseMercadoLibreListingPriceEstimates(payload).map(
        (estimate) =>
          addMercadoLibreInstallmentTerms(estimate, connection.siteId),
      );
      if (options.length === 0) {
        throw ErrorFactory.InvalidRequest(
          "Mercado Libre no devolvió tipos de publicación disponibles",
        );
      }
      return NextResponse.json(
        { options },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }
    const parsedEstimate = parseMercadoLibreListingPriceEstimate(payload);
    const estimate = parsedEstimate
      ? addMercadoLibreInstallmentTerms(parsedEstimate, connection.siteId)
      : null;
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
