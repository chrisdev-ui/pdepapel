import { auth } from "@clerk/nextjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
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
      select: { id: true },
    });
    if (!listing) throw ErrorFactory.NotFound("Publicación no encontrada");

    const body = (await request.json()) as Record<string, unknown>;
    const data: Prisma.MarketplaceListingUpdateInput = {};
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
      if (typeof body.categoryId !== "string" || !body.categoryId.trim()) {
        throw ErrorFactory.InvalidRequest(
          "La categoría de Mercado Libre es requerida",
        );
      }
      data.categoryId = body.categoryId.trim();
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
    if (body.syncStock !== undefined) {
      if (typeof body.syncStock !== "boolean") {
        throw ErrorFactory.InvalidRequest(
          "La sincronización de stock no es válida",
        );
      }
      data.syncStock = body.syncStock;
    }
    if (body.attributes !== undefined) {
      data.metadata = {
        attributes: parseAttributes(body.attributes),
      } as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length === 0) {
      throw ErrorFactory.InvalidRequest("No hay cambios para guardar");
    }

    const updatedListing = await prismadb.marketplaceListing.update({
      where: { id: listing.id },
      data,
    });
    return NextResponse.json(updatedListing, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
