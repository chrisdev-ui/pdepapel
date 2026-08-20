import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const MAX_WISHLIST_ITEMS = 200;

const getCorsHeaders = (request: Request) =>
  createCorsHeaders(request, { methods: "GET, PUT, OPTIONS" });

const normalizeProductIds = (value: unknown) => {
  if (!Array.isArray(value) || value.length > MAX_WISHLIST_ITEMS) {
    throw ErrorFactory.InvalidRequest(
      `Envía hasta ${MAX_WISHLIST_ITEMS} productos para sincronizar favoritos`,
    );
  }

  return Array.from(new Set(value)).filter(
    (productId): productId is string =>
      typeof productId === "string" && productId.length > 0 && productId.length <= 128,
  );
};

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const items = await prismadb.customerWishlistItem.findMany({
      where: { storeId: params.storeId, userId },
      select: { productId: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { productIds: items.map((item) => item.productId) },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_WISHLIST_GET", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { productIds, mode = "replace" } = await req.json();
    if (mode !== "merge" && mode !== "replace") {
      throw ErrorFactory.InvalidRequest("Modo de sincronización no válido");
    }

    const requestedProductIds = normalizeProductIds(productIds);
    const existingProducts = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        id: { in: requestedProductIds },
        isArchived: false,
      },
      select: { id: true },
    });
    const validProductIds = existingProducts.map((product) => product.id);

    await prismadb.$transaction(async (tx) => {
      if (mode === "replace") {
        await tx.customerWishlistItem.deleteMany({
          where: {
            storeId: params.storeId,
            userId,
            ...(validProductIds.length > 0
              ? { productId: { notIn: validProductIds } }
              : {}),
          },
        });
      }

      if (validProductIds.length > 0) {
        await tx.customerWishlistItem.createMany({
          data: validProductIds.map((productId) => ({
            storeId: params.storeId,
            userId,
            productId,
          })),
          skipDuplicates: true,
        });
      }
    });

    const items = await prismadb.customerWishlistItem.findMany({
      where: { storeId: params.storeId, userId },
      select: { productId: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      { productIds: items.map((item) => item.productId) },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_WISHLIST_PUT", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
