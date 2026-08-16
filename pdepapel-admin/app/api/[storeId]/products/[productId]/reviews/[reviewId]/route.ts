import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, {
    headers: createCorsHeaders(req, { methods: "GET, PATCH, DELETE, OPTIONS" }),
  });
}

export async function GET(
  req: Request,
  {
    params,
  }: { params: { storeId: string; productId: string; reviewId: string } },
) {
  const corsHeaders = {
    ...createCorsHeaders(req, { methods: "GET, PATCH, DELETE, OPTIONS" }),
    ...CACHE_HEADERS.DYNAMIC,
  };

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId)
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");
    if (!params.reviewId)
      throw ErrorFactory.InvalidRequest("El ID de la reseña es requerido");

    const review = await prismadb.review.findUnique({
      where: {
        id: params.reviewId,
        storeId: params.storeId,
        productId: params.productId,
      },
    });

    if (!review) throw ErrorFactory.NotFound("Reseña no encontrada");

    return NextResponse.json(review, {
      headers: corsHeaders,
    });
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_GET", {
      headers: corsHeaders,
    });
  }
}

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: { storeId: string; productId: string; reviewId: string } },
) {
  const corsHeaders = {
    ...createCorsHeaders(req, { methods: "GET, PATCH, DELETE, OPTIONS" }),
    ...CACHE_HEADERS.NO_CACHE,
  };

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId) {
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");
    }
    if (!params.reviewId) {
      throw ErrorFactory.InvalidRequest("El ID de la reseña es requerido");
    }

    const body = await req.json();
    const { rating, comment } = body;

    // Validate rating if provided
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      throw ErrorFactory.InvalidRequest(
        "La calificación debe estar entre 1 y 5",
      );
    }

    // Verify review exists and user ownership
    const existingReview = await prismadb.review.findUnique({
      where: {
        id: params.reviewId,
        productId: params.productId,
      },
    });

    if (!existingReview) {
      throw ErrorFactory.NotFound("Reseña no encontrada");
    }

    // Only allow review author to update
    if (existingReview.userId !== userId) {
      throw ErrorFactory.Unauthorized();
    }

    const updatedReview = await prismadb.review.update({
      where: {
        id: params.reviewId,
      },
      data: {
        ...(rating !== undefined && { rating }),
        ...(comment !== undefined && { comment }),
      },
    });

    return NextResponse.json(updatedReview, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_PATCH", { headers: corsHeaders });
  }
}

export async function DELETE(
  req: Request,
  {
    params,
  }: { params: { storeId: string; reviewId: string; productId: string } },
) {
  const corsHeaders = {
    ...createCorsHeaders(req, { methods: "GET, PATCH, DELETE, OPTIONS" }),
    ...CACHE_HEADERS.NO_CACHE,
  };

  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.productId) {
      throw ErrorFactory.InvalidRequest("El ID del producto es requerido");
    }
    if (!params.reviewId) {
      throw ErrorFactory.InvalidRequest("El ID de la reseña es requerido");
    }

    // Verify store ownership or review ownership
    const review = await prismadb.review.findUnique({
      where: {
        id: params.reviewId,
        productId: params.productId,
      },
      include: {
        store: {
          select: {
            userId: true,
          },
        },
      },
    });
    if (!review) throw ErrorFactory.NotFound("Reseña no encontrada");

    // Check if user is store owner or review author
    if (review.store.userId !== userId && review.userId !== userId) {
      throw ErrorFactory.Unauthorized();
    }

    await prismadb.review.delete({
      where: { id: params.reviewId },
    });

    return NextResponse.json("La reseña ha sido eliminada correctamente", {
      headers: corsHeaders,
    });
  } catch (error) {
    return handleErrorResponse(error, "REVIEW_DELETE", {
      headers: corsHeaders,
    });
  }
}
