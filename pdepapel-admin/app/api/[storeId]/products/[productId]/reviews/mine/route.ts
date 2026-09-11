import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { PUBLIC_REVIEW_SELECT } from "@/lib/review-moderation";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "GET, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

/**
 * La reseña de la clienta con sesión para este producto (o `null`). Sirve al
 * formulario de la tienda para decidir entre publicar y actualizar sin que
 * las reseñas públicas tengan que llevar el id de cada autora.
 */
export async function GET(
  req: Request,
  { params }: { params: { storeId: string; productId: string } },
) {
  const corsHeaders = getCorsHeaders(req);
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");

    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    const review = await prismadb.review.findFirst({
      where: { userId, productId: params.productId, storeId: params.storeId },
      select: { ...PUBLIC_REVIEW_SELECT, status: true },
    });

    return NextResponse.json({ review }, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_MINE_GET", { headers: corsHeaders });
  }
}
