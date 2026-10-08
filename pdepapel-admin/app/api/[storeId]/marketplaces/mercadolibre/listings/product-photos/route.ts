import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { MERCADOLIBRE_MAX_LISTING_PICTURES } from "@/lib/mercadolibre/listings";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { GALLERY_ORDER } from "@/lib/variant-gallery";

/**
 * Todas las fotos del producto para el asistente de publicación, en el orden
 * de su galería (portada primero, luego las propias y las del grupo). La
 * búsqueda de productos trae solo una por fila.
 */
export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    const productId = new URL(request.url).searchParams.get("productId")?.trim();
    if (!productId) throw ErrorFactory.InvalidRequest("Falta el producto");
    await verifyStoreOwner(userId, params.storeId);

    const product = await prismadb.product.findFirst({
      where: { id: productId, storeId: params.storeId },
      select: {
        id: true,
        isKit: true,
        brand: true,
        productGroup: { select: { name: true } },
        images: {
          select: { url: true, isMain: true },
          orderBy: GALLERY_ORDER,
          take: MERCADOLIBRE_MAX_LISTING_PICTURES,
        },
      },
    });
    if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

    return NextResponse.json(
      {
        productId: product.id,
        isKit: product.isKit,
        brand: product.brand,
        productGroupName: product.productGroup?.name?.trim() || null,
        images: product.images,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_LISTING_PRODUCT_PHOTOS_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
