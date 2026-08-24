import { auth } from "@clerk/nextjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { isMercadoLibreCategoryId } from "@/lib/mercadolibre/categories";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type Attribute = { id: string; value_name?: string; value_id?: string };

function parseAttributes(value: unknown): Attribute[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw ErrorFactory.InvalidRequest(
      "Las características del perfil no son válidas",
    );
  }

  return value.map((attribute) => {
    if (
      !attribute ||
      typeof attribute !== "object" ||
      Array.isArray(attribute)
    ) {
      throw ErrorFactory.InvalidRequest(
        "Una característica del perfil no es válida",
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

function parseStockSafetyBuffer(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw ErrorFactory.InvalidRequest(
      "Las unidades de seguridad deben ser un número entero entre 0 y 10000",
    );
  }
  return parsed;
}

function parseOptionalTargetProfit(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw ErrorFactory.InvalidRequest(
      "La utilidad objetivo debe ser un número igual o mayor que cero",
    );
  }
  return parsed;
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const profiles = await prismadb.marketplacePublicationProfile.findMany({
      where: { storeId: params.storeId },
      include: { localCategory: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(profiles, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_PROFILES_GET", {
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
    const localCategoryId =
      typeof body.localCategoryId === "string"
        ? body.localCategoryId.trim()
        : "";
    const categoryId =
      typeof body.categoryId === "string"
        ? body.categoryId.trim().toUpperCase()
        : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (
      !localCategoryId ||
      !isMercadoLibreCategoryId(categoryId) ||
      !name ||
      name.length > 120
    ) {
      throw ErrorFactory.InvalidRequest(
        "Define un nombre, una categoría local y una categoría válida de Mercado Libre",
      );
    }

    const localCategory = await prismadb.category.findFirst({
      where: { id: localCategoryId, storeId: params.storeId },
      select: { id: true },
    });
    if (!localCategory) {
      throw ErrorFactory.NotFound("Categoría local no encontrada");
    }

    const profile = await prismadb.marketplacePublicationProfile.upsert({
      where: {
        storeId_localCategoryId: {
          storeId: params.storeId,
          localCategoryId,
        },
      },
      update: {
        categoryId,
        name,
        attributes: parseAttributes(body.attributes) as Prisma.InputJsonValue,
        stockSafetyBuffer: parseStockSafetyBuffer(body.stockSafetyBuffer),
        minimumMarginAmount: parseOptionalTargetProfit(
          body.minimumMarginAmount,
        ),
      },
      create: {
        storeId: params.storeId,
        localCategoryId,
        categoryId,
        name,
        attributes: parseAttributes(body.attributes) as Prisma.InputJsonValue,
        stockSafetyBuffer: parseStockSafetyBuffer(body.stockSafetyBuffer),
        minimumMarginAmount: parseOptionalTargetProfit(
          body.minimumMarginAmount,
        ),
      },
      include: { localCategory: { select: { id: true, name: true } } },
    });
    return NextResponse.json(profile, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_PROFILES_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
