import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getMercadoLibreJson,
  mutateMercadoLibreJson,
  requestMercadoLibreJson,
} from "@/lib/mercadolibre/client";
import {
  buildMercadoLibreListingMetadata,
  getMercadoLibreListingMetadata,
} from "@/lib/mercadolibre/listing-metadata";
import {
  addMercadoLibreInstallmentTerms,
  parseMercadoLibreListingPriceEstimates,
} from "@/lib/mercadolibre/listing-pricing";
import {
  parseMercadoLibreAvailableListingTypes,
  parseMercadoLibreRemoteSaleConditions,
  type MercadoLibreRemoteSaleConditions,
} from "@/lib/mercadolibre/sale-conditions";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type ListingRecord = {
  id: string;
  connectionId: string;
  externalItemId: string | null;
  metadata: Parameters<typeof getMercadoLibreListingMetadata>[0];
  connection: { siteId: string };
};

async function getListing(storeId: string, listingId: string) {
  const listing = await prismadb.marketplaceListing.findFirst({
    where: { id: listingId, connection: { storeId } },
    select: {
      id: true,
      connectionId: true,
      externalItemId: true,
      metadata: true,
      connection: { select: { siteId: true } },
    },
  });
  if (!listing?.externalItemId) {
    throw ErrorFactory.InvalidRequest(
      "Esta publicación todavía no existe en Mercado Libre",
    );
  }
  return listing;
}

async function getRemoteConditions(listing: ListingRecord) {
  const payload = await getMercadoLibreJson(
    listing.connectionId,
    `/items/${encodeURIComponent(listing.externalItemId!)}`,
  );
  const current = parseMercadoLibreRemoteSaleConditions(payload);
  if (!current) {
    throw ErrorFactory.InvalidRequest(
      "Mercado Libre no devolvió las condiciones actuales de la publicación",
    );
  }
  return current;
}

async function getAvailableListingTypes(
  listing: ListingRecord,
  current: MercadoLibreRemoteSaleConditions,
) {
  const response = await requestMercadoLibreJson(
    listing.connectionId,
    `/items/${encodeURIComponent(listing.externalItemId!)}/available_listing_types`,
  );
  const available = response.ok
    ? parseMercadoLibreAvailableListingTypes(response.payload)
    : [];
  return Array.from(new Set([current.listingType, ...available]));
}

async function getPriceOptions(
  listing: ListingRecord,
  current: MercadoLibreRemoteSaleConditions,
  allowedTypes: string[],
) {
  const query = new URLSearchParams({
    price: String(current.price),
    category_id: current.categoryId,
  });
  const payload = await getMercadoLibreJson(
    listing.connectionId,
    `/sites/${encodeURIComponent(listing.connection.siteId)}/listing_prices?${query.toString()}`,
  );
  const allowed = new Set(allowedTypes);
  return parseMercadoLibreListingPriceEstimates(payload)
    .filter(
      (estimate) =>
        estimate.listingTypeId && allowed.has(estimate.listingTypeId),
    )
    .map((estimate) =>
      addMercadoLibreInstallmentTerms(
        estimate,
        listing.connection.siteId,
      ),
    );
}

async function persistRemoteConditions(
  listing: ListingRecord,
  current: MercadoLibreRemoteSaleConditions,
) {
  const metadata = getMercadoLibreListingMetadata(listing.metadata);
  await prismadb.marketplaceListing.update({
    where: { id: listing.id },
    data: {
      listingType: current.listingType,
      metadata: buildMercadoLibreListingMetadata({
        current: listing.metadata,
        saleConditions: {
          shippingMode: "me2",
          freeShipping: current.freeShipping,
          localPickUp: current.localPickUp,
          packageDimensions: metadata.saleConditions?.packageDimensions ?? null,
        },
      }),
      lastError: null,
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const listing = await getListing(params.storeId, params.listingId);
    const current = await getRemoteConditions(listing);
    const availableListingTypes = await getAvailableListingTypes(
      listing,
      current,
    );
    const options = await getPriceOptions(
      listing,
      current,
      availableListingTypes,
    );
    await persistRemoteConditions(listing, current);

    return NextResponse.json(
      { current, availableListingTypes, options },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_SALE_CONDITIONS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await request.json()) as Record<string, unknown>;
    const listingType =
      typeof body.listingType === "string" ? body.listingType.trim() : "";
    const freeShipping = body.freeShipping;
    if (!listingType || typeof freeShipping !== "boolean") {
      throw ErrorFactory.InvalidRequest(
        "Selecciona las cuotas y quién asumirá el envío",
      );
    }

    const listing = await getListing(params.storeId, params.listingId);
    let current = await getRemoteConditions(listing);
    const availableListingTypes = await getAvailableListingTypes(
      listing,
      current,
    );
    if (!availableListingTypes.includes(listingType)) {
      throw ErrorFactory.InvalidRequest(
        "Mercado Libre no permite cambiar esta publicación al plan de cuotas seleccionado",
      );
    }
    if (current.mandatoryFreeShipping && !freeShipping) {
      throw ErrorFactory.InvalidRequest(
        "Mercado Libre exige envío gratis para esta publicación; no se puede trasladar el costo a la compradora",
      );
    }

    try {
      if (listingType !== current.listingType) {
        await mutateMercadoLibreJson(
          listing.connectionId,
          `/items/${encodeURIComponent(listing.externalItemId!)}/listing_type`,
          { method: "POST", body: { id: listingType } },
        );
        current = await getRemoteConditions(listing);
      }

      if (freeShipping !== current.freeShipping) {
        await mutateMercadoLibreJson(
          listing.connectionId,
          `/items/${encodeURIComponent(listing.externalItemId!)}`,
          {
            method: "PUT",
            body: { shipping: { free_shipping: freeShipping } },
          },
        );
      }
    } catch (error) {
      try {
        current = await getRemoteConditions(listing);
        await persistRemoteConditions(listing, current);
      } catch {}
      throw error;
    }

    current = await getRemoteConditions(listing);
    await persistRemoteConditions(listing, current);

    return NextResponse.json(
      { current },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_SALE_CONDITIONS_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
