import { auth } from "@clerk/nextjs/server";
import {
  MarketplaceConnectionStatus,
  MarketplaceListingStatus,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isMercadoLibreCategoryId } from "@/lib/mercadolibre/categories";
import { inspectMercadoLibreCategory } from "@/lib/mercadolibre/category-validation";
import { getMercadoLibreCategoryAppError } from "@/lib/mercadolibre/category-validation-error";
import {
  buildMercadoLibreListingMetadata,
  getMercadoLibreListingMetadata,
  normalizeMercadoLibreFamilyName,
  parseMercadoLibreSaleConditions,
} from "@/lib/mercadolibre/listing-metadata";
import {
  enqueuePendingMarketplaceOutboxEvents,
  isMarketplaceListingPublicationInProgress,
  queueMarketplaceListingContentSyncEvent,
  queueMarketplacePriceSyncEvent,
  queueMarketplaceStockSyncEvents,
} from "@/lib/mercadolibre/outbox";
import { updateMarketplaceListingMetadataGuarded } from "@/lib/mercadolibre/listing-metadata-writes";
import { getMercadoLibreQueueConfigurationStatus } from "@/lib/mercadolibre/queue";
import {
  evaluateListingPrice,
  parsePriceOverride,
} from "@/lib/mercadolibre/listing-price-guard";
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

function parseFamilyName(value: unknown) {
  if (value === undefined) return undefined;

  const familyName = normalizeMercadoLibreFamilyName(value);
  if (!familyName) {
    throw ErrorFactory.InvalidRequest(
      "Escribe un nombre de familia para Mercado Libre",
    );
  }
  if (familyName.length > 120) {
    throw ErrorFactory.InvalidRequest(
      "El nombre de familia de Mercado Libre puede tener máximo 120 caracteres",
    );
  }
  return familyName;
}

function parseSaleConditions(value: unknown) {
  if (value === undefined) return undefined;
  const saleConditions = parseMercadoLibreSaleConditions(value);
  if (!saleConditions) {
    throw ErrorFactory.InvalidRequest(
      "Las condiciones de envío de Mercado Libre no son válidas",
    );
  }
  return saleConditions;
}

export async function PATCH(
  request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = await auth();
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
        syncStock: true,
        stockSafetyBuffer: true,
        metadata: true,
        connection: { select: { status: true, recoveryScheduleId: true } },
        product: {
          select: {
            acqPrice: true,
            transportationCost: true,
            images: { select: { url: true } },
          },
        },
      },
    });
    if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");

    const body = (await request.json()) as Record<string, unknown>;
    // Un rechazo guardado por Mercado Libre se borra cuando se edita justo lo
    // que señaló; así el asistente deja de abrir en un paso ya corregido.
    const publicationFailure = getMercadoLibreListingMetadata(
      listing.metadata,
    ).publicationError;
    const editedFieldsByStep: Record<string, boolean> = {
      producto: body.familyName !== undefined,
      categoria: body.categoryId !== undefined || body.imageUrls !== undefined,
      ficha: body.attributes !== undefined,
      precio: body.marketplacePrice !== undefined,
    };
    const clearsPublicationError = Boolean(
      publicationFailure?.step && editedFieldsByStep[publicationFailure.step],
    );
    const data: Prisma.MarketplaceListingUpdateInput = {};
    /** `undefined` = no se tocó el precio; `null` = retirar la autorización. */
    let belowCostOverride:
      | ReturnType<typeof evaluateListingPrice>
      | undefined;
    const imageUrls = parseImageUrls(body.imageUrls);
    const familyName = parseFamilyName(body.familyName);
    const saleConditions = parseSaleConditions(body.saleConditions);
    if (
      listing.externalItemId &&
      (body.listingType !== undefined || saleConditions !== undefined)
    ) {
      throw ErrorFactory.InvalidRequest(
        "Por seguridad, cambia el tipo de publicación o el envío antes de publicar. Mercado Libre puede limitar cambios posteriores en publicaciones activas.",
      );
    }
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
      // Mismo piso que al crear: por debajo del costo solo con motivo escrito.
      belowCostOverride = evaluateListingPrice({
        price,
        product: listing.product,
        override: parsePriceOverride(body.priceOverride),
      });
      if (!belowCostOverride.ok) {
        throw ErrorFactory.InvalidRequest(
          belowCostOverride.message,
          belowCostOverride.details,
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
      const categoryId = body.categoryId.trim().toUpperCase();
      const categoryInspection = await inspectMercadoLibreCategory(
        listing.connectionId,
        categoryId,
        { includeAttributes: true },
      );
      if (!categoryInspection.ok) {
        throw getMercadoLibreCategoryAppError(categoryInspection);
      }
      data.categoryId = categoryId;
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
    if (
      body.attributes !== undefined ||
      familyName !== undefined ||
      imageUrls !== undefined ||
      saleConditions !== undefined ||
      belowCostOverride !== undefined ||
      clearsPublicationError
    ) {
      data.metadata = buildMercadoLibreListingMetadata({
        current: listing.metadata,
        ...(clearsPublicationError ? { publicationError: null } : {}),
        ...(body.attributes !== undefined
          ? { attributes: parseAttributes(body.attributes) }
          : {}),
        ...(familyName !== undefined ? { familyName } : {}),
        ...(imageUrls !== undefined ? { imageUrls } : {}),
        ...(saleConditions !== undefined ? { saleConditions } : {}),
        // Un precio nuevo por encima del costo retira la autorización anterior.
        ...(belowCostOverride !== undefined
          ? { belowCostOverride: belowCostOverride.ok ? belowCostOverride.override : null }
          : {}),
      });
    }
    if (clearsPublicationError) data.lastError = null;
    if (Object.keys(data).length === 0) {
      throw ErrorFactory.InvalidRequest("No hay cambios para guardar");
    }

    // En una publicación ya creada, lo que cambia aquí debe llegar a Mercado
    // Libre: contenido (categoría, fotos, ficha, nombre) por SYNC_CONTENT y
    // una reserva de seguridad nueva por SYNC_STOCK. Antes se guardaba solo
    // en Administración y la ficha quedaba distinta en cada lado.
    const contentChanged =
      body.attributes !== undefined ||
      familyName !== undefined ||
      imageUrls !== undefined ||
      data.categoryId !== undefined;
    const bufferChanged =
      data.stockSafetyBuffer !== undefined &&
      data.stockSafetyBuffer !== listing.stockSafetyBuffer;
    const priceMayChange =
      data.marketplacePrice !== undefined || body.syncPrice === true;
    const needsQueue =
      Boolean(listing.externalItemId) &&
      (contentChanged || bufferChanged || priceMayChange);
    if (
      needsQueue &&
      (listing.connection.status !== MarketplaceConnectionStatus.CONNECTED ||
        !listing.connection.recoveryScheduleId ||
        !getMercadoLibreQueueConfigurationStatus().configured)
    ) {
      throw ErrorFactory.InvalidRequest(
        "Activa el procesamiento seguro de Mercado Libre antes de editar una publicación activa",
      );
    }

    const result = await prismadb.$transaction(async (transaction) => {
      // Escritura con control de versión: si otra pestaña cambió la ficha
      // desde que se abrió, se responde 409 en vez de pisar sus cambios.
      await updateMarketplaceListingMetadataGuarded(transaction, {
        id: listing.id,
        currentMetadata: listing.metadata,
        data,
      });
      const updated = await transaction.marketplaceListing.findUniqueOrThrow({
        where: { id: listing.id },
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
      const shouldSyncContent = Boolean(updated.externalItemId) && contentChanged;
      if (shouldSyncContent) {
        await queueMarketplaceListingContentSyncEvent(transaction, {
          connectionId: listing.connectionId,
          listingId: listing.id,
          productId: listing.productId,
        });
      }
      const shouldSyncStock =
        Boolean(updated.externalItemId) && bufferChanged && updated.syncStock;
      if (shouldSyncStock) {
        await queueMarketplaceStockSyncEvents(transaction, [listing.productId]);
      }
      return {
        updated,
        queued: shouldSyncPrice || shouldSyncContent || shouldSyncStock,
      };
    });
    if (result.queued) {
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

export async function DELETE(
  _request: Request,
  { params }: { params: { storeId: string; listingId: string } },
) {
  try {
    const { userId } = await auth();
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
        externalItemId: true,
        status: true,
        _count: { select: { orderItems: true, questions: true } },
      },
    });
    if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");
    // Mientras la cola está creando el ítem, el borrador aún no tiene id:
    // borrarlo dejaría una publicación huérfana en Mercado Libre.
    if (
      await isMarketplaceListingPublicationInProgress(
        prismadb,
        listing.connectionId,
        listing.id,
      )
    ) {
      throw ErrorFactory.Conflict(
        "Esta publicación se está enviando a Mercado Libre. Espera a que termine antes de eliminarla.",
      );
    }

    const canDeleteDraft =
      !listing.externalItemId &&
      (listing.status === MarketplaceListingStatus.DRAFT ||
        listing.status === MarketplaceListingStatus.ERROR) &&
      listing._count.orderItems === 0 &&
      listing._count.questions === 0;
    if (!canDeleteDraft) {
      throw ErrorFactory.InvalidRequest(
        "Solo puedes eliminar borradores sin publicar y sin ventas o preguntas asociadas",
      );
    }

    await prismadb.$transaction([
      prismadb.marketplaceOutboxEvent.deleteMany({
        where: { listingId: listing.id },
      }),
      prismadb.marketplaceListing.delete({ where: { id: listing.id } }),
    ]);

    return new NextResponse(null, {
      status: 204,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
