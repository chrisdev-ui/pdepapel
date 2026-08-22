import { auth } from "@clerk/nextjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isMercadoLibreCategoryId } from "@/lib/mercadolibre/categories";
import { buildMercadoLibreListingMetadata } from "@/lib/mercadolibre/listing-metadata";
import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplacePriceSyncEvent,
} from "@/lib/mercadolibre/outbox";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type MercadoLibreAttributeInput = {
  id: string;
  value_id?: string | null;
  value_name?: string | null;
};

function parseAttributes(value: unknown): MercadoLibreAttributeInput[] {
  if (!Array.isArray(value)) {
    throw ErrorFactory.InvalidRequest("Los atributos deben ser una lista");
  }
  if (value.length > 50) {
    throw ErrorFactory.InvalidRequest("Puedes enviar máximo 50 atributos");
  }

  return value.map((attribute) => {
    if (
      !attribute ||
      typeof attribute !== "object" ||
      Array.isArray(attribute)
    ) {
      throw ErrorFactory.InvalidRequest("Uno de los atributos no es válido");
    }
    const data = attribute as Record<string, unknown>;
    const id = typeof data.id === "string" ? data.id.trim() : "";
    const valueId =
      typeof data.value_id === "string" && data.value_id.trim()
        ? data.value_id.trim()
        : null;
    const valueName =
      typeof data.value_name === "string" && data.value_name.trim()
        ? data.value_name.trim()
        : null;
    if (!id || (!valueId && !valueName)) {
      throw ErrorFactory.InvalidRequest(
        "Cada atributo debe tener código y valor de Mercado Libre",
      );
    }
    return {
      id,
      ...(valueId ? { value_id: valueId } : {}),
      ...(valueName ? { value_name: valueName } : {}),
    };
  });
}

function parseImageUrls(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw ErrorFactory.InvalidRequest(
      "Selecciona entre una y diez imágenes para Mercado Libre",
    );
  }
  const imageUrls = Array.from(
    new Set(
      value.flatMap((url) =>
        typeof url === "string" && url.trim() ? [url.trim()] : [],
      ),
    ),
  );
  if (imageUrls.length === 0) {
    throw ErrorFactory.InvalidRequest(
      "Selecciona al menos una imagen para Mercado Libre",
    );
  }
  return imageUrls;
}

export async function PATCH(
  request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const listing = await prismadb.marketplaceListing.findFirst({
      where: {
        id: params.listingId,
        connection: { storeId: params.storeId },
      },
      select: {
        id: true,
        connectionId: true,
        productId: true,
        externalItemId: true,
        marketplacePrice: true,
        syncPrice: true,
        metadata: true,
        product: { select: { images: { select: { url: true } } } },
      },
    });
    if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");

    const body = (await request.json()) as Record<string, unknown>;
    const data: Prisma.MarketplaceListingUpdateInput = {};
    const imageUrls = parseImageUrls(body.imageUrls);
    if (imageUrls) {
      const productImageUrls = new Set(
        listing.product.images.map((image) => image.url),
      );
      if (imageUrls.some((url) => !productImageUrls.has(url))) {
        throw ErrorFactory.InvalidRequest(
          "Las imágenes de Mercado Libre deben pertenecer al producto seleccionado",
        );
      }
    }

    if (body.marketplacePrice !== undefined) {
      const price = Number(body.marketplacePrice);
      if (!Number.isFinite(price) || price <= 0) {
        throw ErrorFactory.InvalidRequest(
          "El precio de Mercado Libre debe ser mayor que cero",
        );
      }
      data.marketplacePrice = price;
    }
    if (body.categoryId !== undefined) {
      if (
        typeof body.categoryId !== "string" ||
        !isMercadoLibreCategoryId(body.categoryId)
      ) {
        throw ErrorFactory.InvalidRequest(
          "La categoría de Mercado Libre es requerida",
        );
      }
      data.categoryId = body.categoryId.trim().toUpperCase();
    }
    if (body.listingType !== undefined) {
      if (typeof body.listingType !== "string" || !body.listingType.trim()) {
        throw ErrorFactory.InvalidRequest(
          "El tipo de publicación es requerido",
        );
      }
      data.listingType = body.listingType.trim();
    }
    if (body.stockSafetyBuffer !== undefined) {
      const buffer = Number(body.stockSafetyBuffer);
      if (!Number.isInteger(buffer) || buffer < 0 || buffer > 10_000) {
        throw ErrorFactory.InvalidRequest("El stock de seguridad no es válido");
      }
      data.stockSafetyBuffer = buffer;
    }
    if (body.minimumMarginAmount !== undefined) {
      if (
        body.minimumMarginAmount === null ||
        body.minimumMarginAmount === ""
      ) {
        data.minimumMarginAmount = null;
      } else {
        const minimumMarginAmount = Number(body.minimumMarginAmount);
        if (!Number.isFinite(minimumMarginAmount) || minimumMarginAmount < 0) {
          throw ErrorFactory.InvalidRequest(
            "El margen mínimo debe ser un número igual o mayor que cero",
          );
        }
        data.minimumMarginAmount = minimumMarginAmount;
      }
    }
    if (body.syncStock !== undefined) {
      if (typeof body.syncStock !== "boolean") {
        throw ErrorFactory.InvalidRequest(
          "La sincronización de stock no es válida",
        );
      }
      data.syncStock = body.syncStock;
    }
    if (body.syncPrice !== undefined) {
      if (typeof body.syncPrice !== "boolean") {
        throw ErrorFactory.InvalidRequest(
          "La sincronización de precio no es válida",
        );
      }
      data.syncPrice = body.syncPrice;
    }
    if (body.attributes !== undefined || imageUrls !== undefined) {
      data.metadata = buildMercadoLibreListingMetadata({
        current: listing.metadata,
        ...(body.attributes !== undefined
          ? { attributes: parseAttributes(body.attributes) }
          : {}),
        ...(imageUrls !== undefined ? { imageUrls } : {}),
      });
    }
    if (Object.keys(data).length === 0) {
      throw ErrorFactory.InvalidRequest("No hay cambios para guardar");
    }

    const result = await prismadb.$transaction(async (transaction) => {
      const updated = await transaction.marketplaceListing.update({
        where: { id: listing.id },
        data,
      });
      const shouldSyncPrice =
        Boolean(updated.externalItemId) &&
        updated.syncPrice &&
        updated.marketplacePrice !== null &&
        (listing.marketplacePrice !== updated.marketplacePrice ||
          body.syncPrice === true);
      if (shouldSyncPrice) {
        await queueMarketplacePriceSyncEvent(transaction, {
          connectionId: listing.connectionId,
          listingId: listing.id,
          productId: listing.productId,
          targetPrice: updated.marketplacePrice!,
        });
      }
      return { updated, shouldSyncPrice };
    });
    if (result.shouldSyncPrice) {
      await enqueuePendingMarketplaceOutboxEvents(listing.connectionId);
    }

    return NextResponse.json(result.updated, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
