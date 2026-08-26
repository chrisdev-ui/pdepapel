import { auth } from "@clerk/nextjs";
import { MarketplaceProvider, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isMercadoLibreCategoryId } from "@/lib/mercadolibre/categories";
import { inspectMercadoLibreCategory } from "@/lib/mercadolibre/category-validation";
import { getMercadoLibreCategoryAppError } from "@/lib/mercadolibre/category-validation-error";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type Attribute = { id: string; value_name?: string; value_id?: string };

function parseAttributes(value: unknown): Attribute[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw ErrorFactory.InvalidRequest(
      "La plantilla debe incluir entre 1 y 50 características",
    );
  }
  return value.map((attribute) => {
    if (
      !attribute ||
      typeof attribute !== "object" ||
      Array.isArray(attribute)
    ) {
      throw ErrorFactory.InvalidRequest(
        "Una característica de la plantilla no es válida",
      );
    }
    const item = attribute as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const valueName =
      typeof item.value_name === "string" ? item.value_name.trim() : "";
    const valueId =
      typeof item.value_id === "string" ? item.value_id.trim() : "";
    if (!id || (!valueName && !valueId)) {
      throw ErrorFactory.InvalidRequest(
        "Cada característica necesita código y valor",
      );
    }
    return {
      id,
      ...(valueName ? { value_name: valueName } : {}),
      ...(valueId ? { value_id: valueId } : {}),
    };
  });
}

function parseOptionalNonNegativeNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw ErrorFactory.InvalidRequest(`El campo ${field} no es válido`);
  }
  return numberValue;
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json(
      await prismadb.marketplaceCategoryTemplate.findMany({
        where: { storeId: params.storeId },
        orderBy: { updatedAt: "desc" },
      }),
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_TEMPLATES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = (await request.json()) as Record<string, unknown>;
    const categoryId =
      typeof body.categoryId === "string"
        ? body.categoryId.trim().toUpperCase()
        : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!isMercadoLibreCategoryId(categoryId) || !name || name.length > 120) {
      throw ErrorFactory.InvalidRequest(
        "Define un nombre y una categoría válida de Mercado Libre para la plantilla",
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
    const categoryInspection = await inspectMercadoLibreCategory(
      connection.id,
      categoryId,
      { includeAttributes: true },
    );
    if (!categoryInspection.ok) {
      throw getMercadoLibreCategoryAppError(categoryInspection);
    }
    const attributes = parseAttributes(body.attributes);
    const stockSafetyBuffer = parseOptionalNonNegativeNumber(
      body.stockSafetyBuffer,
      "stock de seguridad",
    );
    if (stockSafetyBuffer !== null && !Number.isInteger(stockSafetyBuffer)) {
      throw ErrorFactory.InvalidRequest(
        "El stock de seguridad debe ser un número entero",
      );
    }
    const minimumMarginAmount = parseOptionalNonNegativeNumber(
      body.minimumMarginAmount,
      "margen mínimo",
    );
    const template = await prismadb.marketplaceCategoryTemplate.upsert({
      where: { storeId_categoryId: { storeId: params.storeId, categoryId } },
      update: {
        name,
        attributes: attributes as Prisma.InputJsonValue,
        stockSafetyBuffer,
        minimumMarginAmount,
      },
      create: {
        storeId: params.storeId,
        categoryId,
        name,
        attributes: attributes as Prisma.InputJsonValue,
        stockSafetyBuffer,
        minimumMarginAmount,
      },
    });
    return NextResponse.json(template, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_TEMPLATES_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
