import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  buildMercadoLibreListingMetadata,
  type MercadoLibreAttribute,
} from "@/lib/mercadolibre/listing-metadata";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function parseOptionalPrice(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    throw ErrorFactory.InvalidRequest(
      "El precio de Mercado Libre debe ser mayor que cero",
    );
  }
  return price;
}

function parseOptionalCategory(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw ErrorFactory.InvalidRequest(
      "La categoría de Mercado Libre no es válida",
    );
  }
  return value.trim();
}

function parseSafetyBuffer(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  const buffer = Number(value);
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 10_000) {
    throw ErrorFactory.InvalidRequest(
      "El stock de seguridad debe ser un número entero entre 0 y 10000",
    );
  }
  return buffer;
}

function parseMinimumMargin(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const margin = Number(value);
  if (!Number.isFinite(margin) || margin < 0) {
    throw ErrorFactory.InvalidRequest(
      "El margen mínimo debe ser un número igual o mayor que cero",
    );
  }
  return margin;
}

function parseAttributes(value: unknown): MercadoLibreAttribute[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw ErrorFactory.InvalidRequest("Las características no son válidas");
  }

  return value.map((attribute) => {
    if (
      !attribute ||
      typeof attribute !== "object" ||
      Array.isArray(attribute)
    ) {
      throw ErrorFactory.InvalidRequest("Una característica no es válida");
    }
    const input = attribute as Record<string, unknown>;
    const id = typeof input.id === "string" ? input.id.trim() : "";
    const valueId =
      typeof input.value_id === "string" && input.value_id.trim()
        ? input.value_id.trim()
        : null;
    const valueName =
      typeof input.value_name === "string" && input.value_name.trim()
        ? input.value_name.trim()
        : null;
    if (!id || (!valueId && !valueName)) {
      throw ErrorFactory.InvalidRequest(
        "Cada característica debe tener código y valor",
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

function validateProductImageUrls(
  imageUrls: string[] | undefined,
  productImages: { url: string }[],
) {
  if (!imageUrls) return;
  const availableUrls = new Set(productImages.map((image) => image.url));
  if (imageUrls.some((url) => !availableUrls.has(url))) {
    throw ErrorFactory.InvalidRequest(
      "Las imágenes de Mercado Libre deben pertenecer al producto seleccionado",
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true },
    });
    if (!connection)
      return NextResponse.json([], { headers: CACHE_HEADERS.NO_CACHE });

    const listings = await prismadb.marketplaceListing.findMany({
      where: { connectionId: connection.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            stock: true,
            acqPrice: true,
            images: {
              select: { url: true, isMain: true },
              orderBy: { isMain: "desc" },
              take: 10,
            },
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(listings, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTINGS_GET", {
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
    const productId = typeof body.productId === "string" ? body.productId : "";
    if (!productId) throw ErrorFactory.InvalidRequest("Selecciona un producto");

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true, status: true },
    });
    if (
      !connection ||
      connection.status !== MarketplaceConnectionStatus.CONNECTED
    ) {
      throw ErrorFactory.InvalidRequest(
        "Conecta una cuenta activa de Mercado Libre antes de crear publicaciones",
      );
    }

    const product = await prismadb.product.findFirst({
      where: { id: productId, storeId: params.storeId },
      select: { id: true, images: { select: { url: true } } },
    });
    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

    const attributes = parseAttributes(body.attributes);
    const imageUrls = parseImageUrls(body.imageUrls);
    validateProductImageUrls(imageUrls, product.images);

    const listing = await prismadb.marketplaceListing.create({
      data: {
        connectionId: connection.id,
        productId: product.id,
        marketplacePrice: parseOptionalPrice(body.marketplacePrice),
        categoryId: parseOptionalCategory(body.categoryId),
        listingType:
          typeof body.listingType === "string" && body.listingType.trim()
            ? body.listingType.trim()
            : "gold_special",
        stockSafetyBuffer: parseSafetyBuffer(body.stockSafetyBuffer),
        syncStock: body.syncStock !== false,
        syncPrice: body.syncPrice !== false,
        minimumMarginAmount: parseMinimumMargin(body.minimumMarginAmount),
        metadata: buildMercadoLibreListingMetadata({
          current: null,
          attributes,
          imageUrls,
        }),
      },
    });

    return NextResponse.json(listing, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTINGS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
