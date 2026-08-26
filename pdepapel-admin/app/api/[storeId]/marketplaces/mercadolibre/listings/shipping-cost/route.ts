import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getMercadoLibreJson,
  requestMercadoLibreJson,
} from "@/lib/mercadolibre/client";
import { parseMercadoLibreRemoteSaleConditions } from "@/lib/mercadolibre/sale-conditions";
import { parseMercadoLibreShippingCostEstimate } from "@/lib/mercadolibre/shipping-cost";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function getPositiveNumber(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const searchParams = new URL(request.url).searchParams;
    const listingId = searchParams.get("listingId")?.trim() ?? "";
    const requestedPrice = getPositiveNumber(searchParams, "price");
    const heightCm = getPositiveNumber(searchParams, "heightCm");
    const widthCm = getPositiveNumber(searchParams, "widthCm");
    const lengthCm = getPositiveNumber(searchParams, "lengthCm");
    const weightGrams = getPositiveNumber(searchParams, "weightGrams");
    const requestedListingType =
      searchParams.get("listingType")?.trim() ?? "";
    const packageIsComplete =
      heightCm !== null &&
      widthCm !== null &&
      lengthCm !== null &&
      weightGrams !== null;
    if (!listingId && (!requestedPrice || !requestedListingType || !packageIsComplete)) {
      throw ErrorFactory.InvalidRequest(
        "Precio, tipo de publicación, medidas y peso son obligatorios para estimar el envío",
      );
    }

    const activeListing = listingId
      ? await prismadb.marketplaceListing.findFirst({
          where: {
            id: listingId,
            connection: {
              storeId: params.storeId,
              provider: MarketplaceProvider.MERCADOLIBRE,
            },
          },
          select: {
            externalItemId: true,
            connection: { select: { id: true, sellerId: true } },
          },
        })
      : null;
    if (listingId && !activeListing?.externalItemId) {
      throw ErrorFactory.NotFound(
        "La publicación activa no está disponible para cotizar",
      );
    }

    const connection = activeListing?.connection ??
      (await prismadb.marketplaceConnection.findUnique({
        where: {
          storeId_provider: {
            storeId: params.storeId,
            provider: MarketplaceProvider.MERCADOLIBRE,
          },
        },
        select: { id: true, sellerId: true },
      }));
    if (!connection?.sellerId) {
      throw ErrorFactory.NotFound(
        "Reconecta Mercado Libre para consultar costos de envío",
      );
    }

    const remoteConditions = activeListing?.externalItemId
      ? parseMercadoLibreRemoteSaleConditions(
          await getMercadoLibreJson(
            connection.id,
            `/items/${encodeURIComponent(activeListing.externalItemId)}`,
          ),
        )
      : null;
    if (activeListing && !remoteConditions) {
      throw ErrorFactory.InvalidRequest(
        "Mercado Libre no devolvió las condiciones actuales de la publicación",
      );
    }

    const price = requestedPrice ?? remoteConditions?.price ?? null;
    const listingType =
      requestedListingType || remoteConditions?.listingType || "";
    if (!price || !listingType) {
      throw ErrorFactory.InvalidRequest(
        "Mercado Libre no devolvió el precio o las cuotas de la publicación",
      );
    }

    const dimensions = packageIsComplete
      ? `${heightCm}x${widthCm}x${lengthCm},${weightGrams}`
      : null;
    const createResource = (freeShipping: boolean) => {
      const query = new URLSearchParams({
        verbose: "true",
        item_price: String(price),
        listing_type_id: listingType,
        mode: remoteConditions?.shippingMode ?? "me2",
        condition: "new",
        free_shipping: String(freeShipping),
      });
      if (dimensions) query.set("dimensions", dimensions);
      if (activeListing?.externalItemId) {
        query.set("item_id", activeListing.externalItemId);
      }
      if (remoteConditions?.logisticType) {
        query.set("logistic_type", remoteConditions.logisticType);
      }
      return `/users/${encodeURIComponent(connection.sellerId!)}/shipping_options/free?${query.toString()}`;
    };
    const [buyerPaysResponse, sellerOffersFreeResponse] = await Promise.all([
      remoteConditions?.mandatoryFreeShipping
        ? Promise.resolve(null)
        : requestMercadoLibreJson(connection.id, createResource(false)),
      requestMercadoLibreJson(connection.id, createResource(true)),
    ]);
    const buyerPays = buyerPaysResponse?.ok
      ? parseMercadoLibreShippingCostEstimate(buyerPaysResponse.payload)
      : null;
    const sellerOffersFree = sellerOffersFreeResponse.ok
      ? parseMercadoLibreShippingCostEstimate(
          sellerOffersFreeResponse.payload,
        )
      : null;
    if ((!remoteConditions?.mandatoryFreeShipping && !buyerPays) || !sellerOffersFree) {
      throw ErrorFactory.InvalidRequest(
        "Mercado Libre no devolvió una comparación completa de envío",
      );
    }

    return NextResponse.json(
      {
        buyerPays,
        sellerOffersFree,
        currentFreeShipping: remoteConditions?.freeShipping ?? null,
        mandatoryFreeShipping:
          remoteConditions?.mandatoryFreeShipping ?? false,
        logisticType: remoteConditions?.logisticType ?? null,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_SHIPPING_COST_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
