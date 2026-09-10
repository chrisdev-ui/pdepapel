import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import { getProductsPrices } from "@/lib/discount-engine";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
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

/** Favoritos de la cuenta con el precio visto al guardar y la fecha real de guardado. */
async function listItems(storeId: string, userId: string) {
  const rows = await prismadb.customerWishlistItem.findMany({
    where: { storeId, userId },
    select: { productId: true, savedPrice: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({ productId: row.productId, savedPrice: row.savedPrice, createdAt: row.createdAt }));
}

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const items = await listItems(params.storeId, userId);

    return NextResponse.json(
      { productIds: items.map((item) => item.productId), items },
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
    const { userId } = await auth();
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
      select: { id: true, categoryId: true, price: true, productGroupId: true },
    });
    const validProductIds = existingProducts.map((product) => product.id);
    // Precio que ve la clienta hoy (con oferta): queda fijado en la fila nueva.
    const pricing = validProductIds.length > 0
      ? await getProductsPrices(
          existingProducts.map((product) => ({ ...product, price: Number(product.price) })),
          params.storeId,
        )
      : new Map();
    const savedPriceFor = (productId: string) => {
      const product = existingProducts.find((item) => item.id === productId);
      return pricing.get(productId)?.price ?? (product ? Number(product.price) : null);
    };

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
            savedPrice: savedPriceFor(productId),
          })),
          skipDuplicates: true,
        });
      }
    });

    const items = await listItems(params.storeId, userId);

    return NextResponse.json(
      { productIds: items.map((item) => item.productId), items },
      { headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE } },
    );
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_WISHLIST_PUT", {
      headers: { ...corsHeaders, ...CACHE_HEADERS.NO_CACHE },
    });
  }
}
