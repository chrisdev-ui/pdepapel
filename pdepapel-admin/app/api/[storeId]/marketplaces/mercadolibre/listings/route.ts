import { auth } from "@clerk/nextjs";
import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
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
            images: {
              select: { url: true, isMain: true },
              orderBy: { isMain: "desc" },
              take: 1,
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
      select: { id: true },
    });
    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

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
        syncPrice: false,
        metadata: { attributes: [] } as Prisma.InputJsonValue,
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
